// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { derivePublishablePackages, type WorkspacePackage } from "./verify-publication-packages.js";
import {
  PROVENANCE_SCOPE_NOTE,
  type ProvenanceCheck,
  verifyProvenance,
} from "./verify-publication-provenance.js";
import {
  DEFAULT_REGISTRY_BASE,
  type PresenceVerdict,
  pollPresence,
  type RegistryTarget,
} from "./verify-publication-registry.js";
import { runSmokeTest, type SmokeResult } from "./verify-publication-smoke.js";

// Post-publish verification for the npm release, run OUTSIDE the pipeline that built it. Three
// checks: (1) every published package is present on registry.npmjs.org, with the package list
// DERIVED from the workspace's own manifests, never hand-kept; (2) each published version's npm
// provenance attestation is present and content-bound to the actual tarball; (3) a consumer
// smoke test installs from the real registry into a throwaway project with a fresh cache and
// proves the documented quickstart still traces what the docs promise. "Resolves and installs"
// is not the bar; an adopter's day one is.
//
// A manual publish-checklist step and the nightly canary's payload — never a per-commit gate: it
// makes real network calls, and npm's own propagation, while normally fast, is not instant.

const USAGE = `Usage: tsx tools/verify-publication.ts [version] [options]

Options:
  --dry-run           print the packages/URLs that would be checked; no network calls, no
                       smoke test.
  --timeout=SECONDS   overall registry-poll deadline (default: 1800).
  --interval=SECONDS  steady-state polling interval once backoff has ramped up (default: 60).
  -h, --help          print this text and exit 0.

[version] defaults to the latest "v*" git tag, else packages/core/package.json's own version.
`;

interface Args {
  readonly version?: string;
  readonly dryRun: boolean;
  readonly timeoutMs?: number;
  readonly maxIntervalMs?: number;
  readonly help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let version: string | undefined;
  let dryRun = false;
  let timeoutMs: number | undefined;
  let maxIntervalMs: number | undefined;
  let help = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "-h" || arg === "--help") help = true;
    else if (arg.startsWith("--timeout="))
      timeoutMs = Number(arg.slice("--timeout=".length)) * 1000;
    else if (arg.startsWith("--interval="))
      maxIntervalMs = Number(arg.slice("--interval=".length)) * 1000;
    else if (!arg.startsWith("-")) version = arg;
  }
  return { version, dryRun, timeoutMs, maxIntervalMs, help };
}

function latestGitTagVersion(repoRoot: string): string | undefined {
  try {
    const tags = execSync("git tag --list 'v*' --sort=-version:refname", {
      cwd: repoRoot,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    return tags[0]?.replace(/^v/, "");
  } catch {
    return undefined;
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** No CLI argument names a version under test: fall back to the latest release tag, and if this
 * checkout has none reachable (a shallow clone with no tags fetched), the workspace's own
 * current version — never silently defaulting to "whatever happens to build". */
function resolveVersion(repoRoot: string, explicit: string | undefined): string {
  if (explicit) return explicit;
  const tagged = latestGitTagVersion(repoRoot);
  if (tagged) return tagged;
  return readJson<{ version: string }>(join(repoRoot, "packages/core/package.json")).version;
}

function readVitestRuntimeRange(repoRoot: string): string {
  const root = readJson<{ devDependencies: Record<string, string> }>(
    join(repoRoot, "package.json"),
  );
  return root.devDependencies.vitest;
}

function printDryRun(targets: readonly RegistryTarget[], version: string): void {
  console.log(
    `Dry run — no network calls, no smoke test. Would check ${targets.length} package(s) at ${version}:\n`,
  );
  for (const target of targets) {
    console.log(`  ${DEFAULT_REGISTRY_BASE}/${target.name}/${target.version}`);
  }
  console.log(
    `\nSmoke test would install @narrativetrace/core-node + @narrativetrace/proxy + ` +
      `@narrativetrace/vitest @${version} from the real registry into a fresh temp project and ` +
      `run documentation/first-10-minutes.md steps 1-5.`,
  );
}

function printReport(
  targets: readonly RegistryTarget[],
  verdicts: ReadonlyMap<string, PresenceVerdict>,
  provenance: readonly ProvenanceCheck[],
  smoke: SmokeResult,
): void {
  console.log(`\n${"PACKAGE".padEnd(45)}STATUS`);
  for (const target of targets) {
    console.log(`${`${target.name}@${target.version}`.padEnd(45)}${verdicts.get(target.name)}`);
  }
  console.log(`\n${"PROVENANCE".padEnd(45)}RESULT`);
  for (const check of provenance) {
    console.log(
      `${`${check.name}@${check.version}`.padEnd(45)}${check.ok ? "OK" : "FAILED"} — ${check.detail}`,
    );
  }
  console.log(`\nNote: ${PROVENANCE_SCOPE_NOTE}`);
  console.log(`\nSmoke test: ${smoke.verdict} (${smoke.detail})`);
}

async function main(): Promise<void> {
  // Not `import.meta.dirname`: this repo's root package.json is CJS by default, and tsx's
  // CJS-compatibility shim for a directly-executed entry file leaves that undefined. Every
  // other root-level tool in this repo (metrics.ts, doc-coverage.ts, …) assumes invocation from
  // the repo root via `pnpm run <script>` instead — this one does the same.
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const packages: WorkspacePackage[] = derivePublishablePackages(repoRoot);
  if (packages.length === 0) throw new Error("no publishable packages found in the workspace");

  const version = resolveVersion(repoRoot, args.version);
  const targets: RegistryTarget[] = packages.map((p) => ({ name: p.name, version }));

  if (args.dryRun) {
    printDryRun(targets, version);
    return;
  }

  console.log(
    `Verifying ${targets.length} @narrativetrace/* package(s) at ${version} against the real npm registry\n`,
  );

  const verdicts = await pollPresence(targets, {
    timeoutMs: args.timeoutMs,
    maxIntervalMs: args.maxIntervalMs,
    onPending: (pending) =>
      console.error(`>> not yet present, retrying: ${pending.map((t) => t.name).join(", ")}`),
  });

  const provenance: ProvenanceCheck[] = [];
  for (const target of targets) {
    provenance.push(await verifyProvenance(target.name, target.version));
  }

  const smoke = runSmokeTest({
    coreNode: version,
    proxy: version,
    vitestPackage: version,
    vitestRuntimeRange: readVitestRuntimeRange(repoRoot),
  });

  printReport(targets, verdicts, provenance, smoke);

  const allPresent = targets.every((t) => verdicts.get(t.name) === "PRESENT");
  const allProvenanceOk = provenance.every((p) => p.ok);
  process.exitCode = allPresent && allProvenanceOk && smoke.verdict === "PASSED" ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
