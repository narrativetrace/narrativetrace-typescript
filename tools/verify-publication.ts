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
  latestDistTagVersion,
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

[version] is optional: omitted, the LAST PUBLISHED version is verified — the newest "v*" tag
reachable from HEAD, else the npm registry's own "latest" dist-tag for @narrativetrace/core —
never this workspace's own package.json version, which moves on to the next version the instant
a release is cut. Pass [version] explicitly to verify exactly that version instead.
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

/** The newest `v*` tag reachable from HEAD, without the `v` prefix, or `undefined` when none is
 * reachable (a fresh/shallow checkout with no release yet). `--match 'v*'` is quoted so the shell
 * never glob-expands it against files in the working directory, and `--abbrev=0` asks for the
 * bare tag name with no `-N-g<sha>` suffix — the same invocation the Java canonical repo's
 * `scripts/verify-publication.sh` uses for this exact family finding. */
function latestGitTagVersion(repoRoot: string): string | undefined {
  try {
    const tag = execSync("git describe --tags --abbrev=0 --match 'v*'", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return tag ? tag.replace(/^v/, "") : undefined;
  } catch {
    return undefined;
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export interface ResolvedVersion {
  readonly version: string;
  readonly source: string;
}

/**
 * Resolves the version to verify when none was given on the command line — the case the
 * scheduled `verify-publication.yml` run always hits. Resolution order, mirroring the Java
 * canonical repo's `scripts/verify-publication.sh resolve_version` fix for the same family finding:
 *
 *   1. the newest `v*` tag reachable from HEAD (`latestGitTagVersion`).
 *   2. the npm registry's own `latest` dist-tag for `@narrativetrace/core`, when no such tag
 *      exists yet (a scratch checkout rehearsing this tool before any release).
 *
 * The workspace's own `packages/*\/package.json` version is NEVER consulted here: it moves on
 * to the next version the instant a release is cut, so a scheduled run that read it would poll
 * the registry for artifacts that were never going to exist — the exact bug this fixes. An
 * explicit `explicit` version always wins outright and this resolution never runs at all.
 * Throws when neither source answers, rather than silently defaulting to "whatever happens to
 * build".
 */
export async function resolveVersion(
  repoRoot: string,
  explicit: string | undefined,
  registryBase: string = DEFAULT_REGISTRY_BASE,
): Promise<ResolvedVersion> {
  if (explicit) return { version: explicit, source: "explicit version argument" };
  const tagged = latestGitTagVersion(repoRoot);
  if (tagged) {
    return { version: tagged, source: `newest v* tag reachable from HEAD (v${tagged})` };
  }
  const latest = await latestDistTagVersion(registryBase, "@narrativetrace/core");
  if (latest) {
    return {
      version: latest,
      source: 'npm registry "latest" dist-tag for @narrativetrace/core (no v* tag found)',
    };
  }
  throw new Error(
    'no version given, no v* tag reachable from HEAD, and the npm registry "latest" dist-tag ' +
      "for @narrativetrace/core did not answer. Pass a version explicitly.",
  );
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
      `run documentation/sixty-seconds.md steps 1-5.`,
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

  const { version, source } = await resolveVersion(repoRoot, args.version);
  if (!args.version) {
    console.error(
      `>> no version given — verifying the last published version: ${version} (${source})`,
    );
  }
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

// Guarded: contract-check.ts imports `resolveVersion` from this module for the SAME version-
// resolution algorithm (docs-vs-published-gate-2026-09-12.md §2) — an unconditional `main()` here
// would run this script's OWN CLI (parsing the importing script's `process.argv`, polling the
// registry, running its own smoke test) purely as an import side effect. Only run when this file
// is the actual entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
