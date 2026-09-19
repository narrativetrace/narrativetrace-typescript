// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// GitHub Actions' own actions (the `actions/*` org) bundled the node20 runtime through their v4
// majors; each one's move to node24 landed at v5 — checkout, setup-node, cache, upload-artifact
// alike. GitHub warns on a node20 action today and will eventually stop forcing it onto the node24
// runner, so a pin that regresses back below an action's node24-era major must fail the gate before
// it ships, not after a warning turns into a hard failure. This module holds the pure, unit-tested
// scan; `workflow-pin-check-cli.ts` is the thin `pnpm run` entry point wired into `check`.
//
// github/codeql-action moved node20 -> node24 at its own v3 -> v4 boundary (verified live,
// 2026-09-18: v3.38.1's action.yml says `using: node20`, v4.30.7's says `using: node24`) — same
// shape as the `actions/*` majors above, just a different org. Its `uses:` steps pin a SUBACTION
// path (`github/codeql-action/upload-sarif@<sha>`, `github/codeql-action/init@<sha>`, …); the
// node major is a property of the repo, not the subaction, so the map below is keyed on the
// `owner/repo` prefix and {@link findPinViolations} normalizes a subaction pin down to it before
// looking up. `ossf/scorecard-action` (added alongside codeql-action for the Scorecard workflow)
// is deliberately NOT listed here: its `action.yaml` uses `runs.using: docker` — a Docker action
// carries no node runtime at all, so "node24-era major" does not apply to it; it stays out of
// scope the same way a non-`actions/*` action like `NuGet/login` always has.

/** The lowest major, per `owner/repo`, that runs on node24. A pin below this major is node20-era.
 * Keyed on the action's `owner/repo` prefix even for an action pinned via a subaction path (e.g.
 * `github/codeql-action/upload-sarif`) — see the module comment above. Extend this map only when
 * the repo starts using another node-runtime action that has made (or is making) that jump. */
export const MIN_NODE24_MAJOR: Readonly<Record<string, number>> = {
  "actions/checkout": 5,
  "actions/setup-node": 5,
  "actions/cache": 5,
  "actions/upload-artifact": 5,
  "github/codeql-action": 4,
};

export interface PinViolation {
  /** Repo-relative, POSIX-separated. */
  readonly file: string;
  readonly line: number;
  readonly action: string;
  readonly major: number;
  readonly text: string;
}

// A `uses:` step pinned by full commit SHA with a trailing `# vX...` comment, e.g.
// `uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0`, or a subaction path
// like `uses: github/codeql-action/upload-sarif@1c5b675653bb5c22dbe9b12b556ec555138e09fd # v4.38.1`
// — the trailing `(?:\/[\w.-]+)*` is what lets the second case match at all; without it the
// pattern stops at the first two segments and never reaches the `@`, so the whole line silently
// fails to match (found live 2026-09-18 wiring in codeql-action/upload-sarif: the unwidened
// pattern let a node20-era pin of it through with no violation at all, not even a false negative
// the tests would show — it never matched the line to begin with).
const USES_PATTERN = /uses:\s*([\w.-]+\/[\w.-]+(?:\/[\w.-]+)*)@[0-9a-f]{40}\s*#\s*v(\d+)/;

/** The `owner/repo` prefix of a captured action string — a subaction path
 * (`github/codeql-action/upload-sarif`) collapses to `github/codeql-action`, since the node
 * runtime major is a property of the repo the action lives in, not the subaction. Exported so the
 * CLI can look up a {@link PinViolation}'s required major by the same key `findPinViolations`
 * used internally, rather than re-deriving (or mis-deriving) it from the full action string. */
export function ownerRepo(action: string): string {
  const [owner, repo] = action.split("/");
  return `${owner}/${repo}`;
}

/** Every `.yml`/`.yaml` file directly under `.github/workflows`, absolute paths, sorted. */
export function findWorkflowFiles(repoRoot: string): string[] {
  const dir = join(repoRoot, ".github", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => join(dir, name))
    .sort();
}

/** Every `uses:` pin below its action's {@link MIN_NODE24_MAJOR}, across every workflow file —
 * an action not listed in {@link MIN_NODE24_MAJOR} is out of scope and never flagged. */
export function findPinViolations(repoRoot: string): PinViolation[] {
  const violations: PinViolation[] = [];
  for (const file of findWorkflowFiles(repoRoot)) {
    const rel = relative(repoRoot, file);
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((text, index) => {
      const match = USES_PATTERN.exec(text);
      if (!match) return;
      const [, action, majorText] = match;
      const minMajor = MIN_NODE24_MAJOR[ownerRepo(action)];
      if (minMajor === undefined) return;
      const major = Number(majorText);
      if (major < minMajor) {
        violations.push({ file: rel, line: index + 1, action, major, text: text.trim() });
      }
    });
  }
  return violations;
}

export interface OrderViolation {
  /** Repo-relative, POSIX-separated. */
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

// `actions/setup-node` v5 reads package.json's `packageManager` field and enables its
// package-manager cache BY DEFAULT (`package-manager-cache: true` unless set otherwise) — the
// v5 README: "By default, `package-manager-cache` is set to `true`, which enables caching when a
// valid package manager field is detected in the `package.json` file." Caching runs `pnpm store
// path` as part of the setup-node step itself, so if pnpm is not on PATH yet — i.e. `corepack
// enable` has not run as an earlier step in the same job — the step fails with "Unable to locate
// executable file: pnpm" before any later step gets a chance to provide it (found live 2026-09-19:
// every workflow in this repo ran `corepack enable` AFTER `actions/setup-node`).
const JOBS_HEADER_PATTERN = /^jobs:\s*$/;
// A job's own key, e.g. `  check:` — two-space indent, nothing after the colon. Step lines (and
// every job property) sit deeper, so this pattern only ever matches a job boundary.
const JOB_HEADER_PATTERN = /^ {2}[\w.-]+:\s*$/;
const SETUP_NODE_STEP_PATTERN = /uses:\s*actions\/setup-node@/;
const COREPACK_ENABLE_STEP_PATTERN = /run:\s*corepack enable\b/;
const PNPM_ACTION_SETUP_STEP_PATTERN = /uses:\s*pnpm\/action-setup@/;

/** Every `actions/setup-node` step not preceded, within the same job, by a `corepack enable` step
 * (or a `pnpm/action-setup` step) — see the module comment above for why the order matters. A job
 * with no `actions/setup-node` step at all is out of scope and never flagged. */
export function findOrderViolations(repoRoot: string): OrderViolation[] {
  const violations: OrderViolation[] = [];
  for (const file of findWorkflowFiles(repoRoot)) {
    const rel = relative(repoRoot, file);
    const lines = readFileSync(file, "utf-8").split("\n");
    let inJobs = false;
    let pnpmReady = false;
    lines.forEach((text, index) => {
      if (JOBS_HEADER_PATTERN.test(text)) {
        inJobs = true;
        return;
      }
      if (inJobs && JOB_HEADER_PATTERN.test(text)) {
        pnpmReady = false;
        return;
      }
      if (COREPACK_ENABLE_STEP_PATTERN.test(text) || PNPM_ACTION_SETUP_STEP_PATTERN.test(text)) {
        pnpmReady = true;
        return;
      }
      if (SETUP_NODE_STEP_PATTERN.test(text) && !pnpmReady) {
        violations.push({ file: rel, line: index + 1, text: text.trim() });
      }
    });
  }
  return violations;
}
