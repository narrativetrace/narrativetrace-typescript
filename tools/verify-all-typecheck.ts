// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { type CommandOutcome, runCommand } from "./verify-all-exec.js";
import { discoverPackages, packageSlug } from "./verify-all-packages.js";
import { runPool } from "./verify-all-pool.js";

export interface TypecheckOutcome {
  readonly packagesChecked: number;
  readonly packagesFailed: readonly string[];
  readonly findings: number;
  readonly seconds: number;
  readonly failingLogFiles: readonly string[];
}

const ERROR_LINE = /: error TS\d+:/;

function runOne(
  repoRoot: string,
  logDir: string,
  pkgDir: string,
): { slug: string; outcome: CommandOutcome; errors: number } {
  const slug = packageSlug(pkgDir);
  const outcome = runCommand(
    "npx",
    ["tsc", "--noEmit", "-p", join(pkgDir, "tsconfig.json")],
    join(logDir, `types-${slug}.log`),
    { cwd: repoRoot },
  );
  const errors = outcome.output.split("\n").filter((line) => ERROR_LINE.test(line)).length;
  return { slug, outcome, errors };
}

/**
 * A standalone `tsc --noEmit` sweep, one package at a time. Unlike Java (where `javac` already
 * fully type-checks every compile), this port's real build step is `tsup`/esbuild, which strips
 * types without verifying them — so `tsc --noEmit` is genuinely the "standalone type-checking
 * tool, distinct from whatever the compiler already does" this category asks for, not a
 * redundant re-check. Nothing in the repo wires this today; `verify:all` is the first caller.
 */
export async function runTypecheckSweep(
  repoRoot: string,
  logDir: string,
  concurrency: number,
): Promise<TypecheckOutcome> {
  const packages = discoverPackages(repoRoot);
  const start = Date.now();
  const results = await runPool(packages, concurrency, (pkg) => runOne(repoRoot, logDir, pkg.dir));
  const failing = results.filter((r) => r.outcome.exitCode !== 0);
  return {
    packagesChecked: results.length,
    packagesFailed: failing.map((r) => r.slug),
    findings: results.reduce((sum, r) => sum + r.errors, 0),
    seconds: (Date.now() - start) / 1000,
    failingLogFiles: failing.map((r) => r.outcome.logFile),
  };
}
