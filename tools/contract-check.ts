// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVersion } from "./verify-publication.js";

/**
 * The nightly docs-vs-published contract gate (docs-vs-published-gate-2026-09-12.md §2, ruling
 * 4): resolves the published version the same way tools/verify-publication.ts does (newest `v*`
 * tag reachable from HEAD, else npm's own `latest` dist-tag for `@narrativetrace/core`), installs
 * it into a FRESH temp dir with a FRESH npm cache — never this checkout's own node_modules, never
 * `workspace:`/`link:`/`file:` — and runs `contract-probe/run.ts` against it. This is the
 * "fresh-temp-dir install helper" the design note asks for, the same isolation shape
 * verify-publication-smoke.ts's consumer smoke test already uses (a fresh cache directory, the
 * real registry, `--no-audit --no-fund`), built once here for contract-probe to reuse.
 *
 * NEVER run in `pnpm run check` — real network calls, a real npm install. Nightly/on-demand only.
 * Usage: tsx tools/contract-check.ts [version] [--dry-run]
 */

// Every npm coordinate a non-entry-point probe imports or invokes (contract-probe/probes/*.mjs);
// entry-point probes need no install at all, an HTTP presence check against the resolved version.
const PROBED_PACKAGES = [
  "@narrativetrace/core",
  "@narrativetrace/proxy",
  "@narrativetrace/vitest",
  "@narrativetrace/cli",
  // logger-threshold-does-not-affect-buffered-path.mjs: @narrativetrace/pino's own "pino" peer
  // dependency is not installed automatically by a single-coordinate `npm install --save`, so it
  // is named here explicitly too.
  "@narrativetrace/pino",
  "pino",
];

function isolatedEnv(cacheDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    npm_config_cache: cacheDir,
    npm_config_registry: "https://registry.npmjs.org",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_loglevel: "error",
  };
}

function readVitestRuntimeRange(repoRoot: string): string {
  const root = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
    devDependencies: Record<string, string>;
  };
  return root.devDependencies.vitest;
}

function writeScratchProject(dir: string): void {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "nt-contract-check-scratch", private: true, type: "module" }, null, 2),
  );
}

/**
 * Installs each `name@spec` ONE AT A TIME rather than one `npm install` naming them all: npm's
 * install is atomic per invocation, so a single coordinate not yet published under this version
 * (e.g. @narrativetrace/cli, on its own separate Apache-2.0 release line — not lockstep with the
 * BSL runtime family) would otherwise sink every OTHER package's probes too. Returns the specs
 * that failed to install, so the caller can report exactly which ones and why their probes then
 * observe nothing.
 */
function installEach(specs: readonly string[], cwd: string, env: NodeJS.ProcessEnv): string[] {
  const failed: string[] = [];
  for (const spec of specs) {
    try {
      execFileSync("npm", ["install", "--no-audit", "--no-fund", "--save", spec], {
        cwd,
        env,
        stdio: "pipe",
      });
    } catch {
      failed.push(spec);
    }
  }
  return failed;
}

function parseArgs(argv: readonly string[]): {
  readonly version?: string;
  readonly dryRun: boolean;
  readonly keep: boolean;
} {
  const dryRun = argv.includes("--dry-run");
  // A failing entry is a claim about a scratch project that no longer exists by the time anyone
  // reads the report, which makes a false verdict from a mis-wired harness indistinguishable from
  // a real docs-vs-published defect until someone rebuilds the project by hand. --keep leaves the
  // consumer project and its npm cache on disk, named in the output, so the next question can be
  // asked of the thing that actually produced the answer.
  const keep = argv.includes("--keep");
  const version = argv.find((arg) => !arg.startsWith("-"));
  return { version, dryRun, keep };
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const resolved = await resolveVersion(repoRoot, args.version);
  console.log(
    `>> checking documentation/contract.yaml against ${resolved.version} (${resolved.source})`,
  );

  if (args.dryRun) {
    console.log(
      `Dry run — would install ${PROBED_PACKAGES.join(", ")}@${resolved.version} into a fresh temp dir`,
    );
    console.log("and run contract-probe/run.ts against it. No network calls, no install.");
    return;
  }

  const scratch = mkdtempSync(join(tmpdir(), "nt-contract-check-"));
  const cache = mkdtempSync(join(tmpdir(), "nt-contract-check-cache-"));
  const resultPath = join(scratch, "contract-result.json");
  const env = isolatedEnv(cache);
  try {
    writeScratchProject(scratch);
    console.log(">> installing into a fresh temp dir with a fresh npm cache ...");
    const specs = [
      ...PROBED_PACKAGES.map((name) => `${name}@${resolved.version}`),
      `vitest@${readVitestRuntimeRange(repoRoot)}`,
    ];
    const failed = installEach(specs, scratch, env);
    if (failed.length > 0) {
      console.error(
        `>> not installed (not yet published at ${resolved.version}?): ${failed.join(", ")}`,
      );
      console.error(
        ">>   that coordinate's own probe(s) will observe nothing and FAIL — every other probe still runs.",
      );
    }

    console.log(">> running contract-probe/run.ts ...");
    execFileSync(
      "npx",
      [
        "tsx",
        join(repoRoot, "contract-probe", "run.ts"),
        "--contract",
        join(repoRoot, "documentation", "contract.yaml"),
        "--version",
        resolved.version,
        "--cwd",
        scratch,
        "--out",
        resultPath,
      ],
      { cwd: repoRoot, env, stdio: "inherit" },
    );
  } catch (error) {
    process.exitCode = 1;
    if (!(error as { status?: number }).status) throw error;
  } finally {
    if (args.keep) {
      console.log(`>> --keep: consumer project left at ${scratch} (npm cache ${cache})`);
    } else {
      rmSync(cache, { recursive: true, force: true });
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
