// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { readJsonOrUndefined, runCommand } from "./verify-all-exec.js";
import { discoverPackages, withScript } from "./verify-all-packages.js";

interface StrykerMutant {
  readonly status: string;
}

interface StrykerFile {
  readonly mutants: readonly StrykerMutant[];
}

interface StrykerReport {
  readonly files: Readonly<Record<string, StrykerFile>>;
}

export interface MutationCounts {
  readonly killed: number;
  readonly survived: number;
  readonly noCoverage: number;
  readonly timeout: number;
}

const MUTATION_REPORT_RELATIVE = "reports/mutation/mutation.json";

function countsOf(report: StrykerReport | undefined): MutationCounts {
  const mutants = Object.values(report?.files ?? {}).flatMap((f) => f.mutants);
  const count = (status: string) => mutants.filter((m) => m.status === status).length;
  return {
    killed: count("Killed"),
    survived: count("Survived"),
    noCoverage: count("NoCoverage"),
    timeout: count("Timeout"),
  };
}

function sumCounts(all: readonly MutationCounts[]): MutationCounts {
  return all.reduce(
    (acc, c) => ({
      killed: acc.killed + c.killed,
      survived: acc.survived + c.survived,
      noCoverage: acc.noCoverage + c.noCoverage,
      timeout: acc.timeout + c.timeout,
    }),
    { killed: 0, survived: 0, noCoverage: 0, timeout: 0 },
  );
}

/**
 * Stryker's own mutation score: killed and timeout both count as "detected"; a mutant nothing
 * covered still counts in the denominator (it lowers the score on purpose — that is what
 * `NoCoverage` is for), matching Stryker's own definition rather than inventing a different one.
 */
export function mutationScore(counts: MutationCounts): number {
  const detected = counts.killed + counts.timeout;
  const total = detected + counts.survived + counts.noCoverage;
  return total === 0 ? 0 : (detected / total) * 100;
}

export interface MutationOutcome {
  readonly exitCode: number;
  readonly seconds: number;
  readonly logFile: string;
  readonly counts: MutationCounts;
  readonly packagesWithReport: number;
  readonly packagesRun: number;
}

/**
 * Runs the repo's own `pnpm run mutate` (the full, non-incremental sweep — no time-box override:
 * this project's own historical timing record puts the full sweep at well under an hour, nowhere
 * near jcstress-unbounded territory) and reads every package's own
 * `reports/mutation/mutation.json` back afterward. One
 * `stryker run` per package, `--concurrency=1` (baked into the script — a stable mutation score
 * needs serialized execution, not parallel workers stepping on each other's coverage instrumentation).
 */
export function runMutationSweep(repoRoot: string, logDir: string): MutationOutcome {
  const packages = withScript(discoverPackages(repoRoot), "mutate");
  const outcome = runCommand("pnpm", ["run", "mutate"], join(logDir, "mutation.log"), {
    cwd: repoRoot,
  });
  const reports = packages.map((pkg) =>
    readJsonOrUndefined<StrykerReport>(join(repoRoot, pkg.dir, MUTATION_REPORT_RELATIVE)),
  );
  return {
    exitCode: outcome.exitCode,
    seconds: outcome.seconds,
    logFile: outcome.logFile,
    counts: sumCounts(reports.map(countsOf)),
    packagesWithReport: reports.filter((r) => r !== undefined).length,
    packagesRun: packages.length,
  };
}
