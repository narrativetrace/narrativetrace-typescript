// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateCoverage,
  type CoverageTotals,
  readCoverageTotals,
} from "./verify-all-coverage.js";
import { type CommandOutcome, runCommand } from "./verify-all-exec.js";
import { discoverPackages, packageSlug, withScript } from "./verify-all-packages.js";
import { runPool } from "./verify-all-pool.js";
import { readVitestResults, type TestFileEntry } from "./verify-all-vitest.js";

export interface PackageTestOutcome {
  readonly slug: string;
  readonly outcome: CommandOutcome;
  readonly entries: TestFileEntry[];
  readonly coverage: CoverageTotals | undefined;
}

export interface FullTestSweep {
  readonly buildOutcome: CommandOutcome;
  readonly rootOutcome: CommandOutcome;
  readonly packageOutcomes: readonly PackageTestOutcome[];
  readonly allEntries: readonly TestFileEntry[];
  readonly coverage: ReturnType<typeof aggregateCoverage>;
}

const VITEST_RESULTS_RELATIVE = "coverage/vitest-results.json";
const COVERAGE_SUMMARY_RELATIVE = "coverage/coverage-summary.json";

/** A crash so early that vitest never flushed its JSON reporter still counts as one real failure — never silently dropped. */
function crashEntry(slug: string, outcome: CommandOutcome): TestFileEntry {
  return {
    module: slug,
    file: `${slug} (vitest exited before writing ${VITEST_RESULTS_RELATIVE})`,
    testsPassed: 0,
    testsFailed: 1,
    testsSkipped: 0,
    timeSeconds: outcome.seconds,
  };
}

function readPackageEntries(
  slug: string,
  pkgDir: string,
  outcome: CommandOutcome,
): TestFileEntry[] {
  const resultsPath = join(pkgDir, VITEST_RESULTS_RELATIVE);
  if (!existsSync(resultsPath)) return [crashEntry(slug, outcome)];
  try {
    return readVitestResults(resultsPath, slug);
  } catch {
    return [crashEntry(slug, outcome)];
  }
}

function readPackageCoverage(pkgDir: string): CoverageTotals | undefined {
  const summaryPath = join(pkgDir, COVERAGE_SUMMARY_RELATIVE);
  if (!existsSync(summaryPath)) return undefined;
  try {
    return readCoverageTotals(summaryPath);
  } catch {
    return undefined;
  }
}

function runPackageCoverage(repoRoot: string, logDir: string, pkgDir: string): PackageTestOutcome {
  const slug = packageSlug(pkgDir);
  const absoluteDir = join(repoRoot, pkgDir);
  const outcome = runCommand(
    "npx",
    [
      "vitest",
      "run",
      "--coverage",
      "--coverage.reporter=json-summary",
      "--coverage.reporter=text",
      "--reporter=json",
      `--outputFile=${VITEST_RESULTS_RELATIVE}`,
    ],
    join(logDir, `test-${slug}.log`),
    { cwd: absoluteDir },
  );
  return {
    slug,
    outcome,
    entries: readPackageEntries(slug, absoluteDir, outcome),
    coverage: readPackageCoverage(absoluteDir),
  };
}

function runRootTests(
  repoRoot: string,
  logDir: string,
): { outcome: CommandOutcome; entries: TestFileEntry[] } {
  const resultsPath = join(logDir, "root-vitest-results.json");
  const outcome = runCommand(
    "npx",
    ["vitest", "run", "--reporter=json", `--outputFile=${resultsPath}`],
    join(logDir, "test-root.log"),
    { cwd: repoRoot },
  );
  if (!existsSync(resultsPath)) return { outcome, entries: [crashEntry("root", outcome)] };
  try {
    return { outcome, entries: readVitestResults(resultsPath, "root") };
  } catch {
    return { outcome, entries: [crashEntry("root", outcome)] };
  }
}

/**
 * The single real invocation set every test/coverage-derived category is sliced from: a fresh
 * `turbo run build`, then every package's own `vitest run --coverage` (JSON reporter + coverage
 * summary, one worker per package up to `concurrency`), then the root suite (architecture,
 * tooling self-tests). Mirrors the Java golden repo's one `./gradlew test` run that `unit-tests`,
 * `property`, `fuzz-tier-a`, `architecture`, and `conformance` all slice — paying for test
 * execution exactly once.
 */
export async function runFullTestSweep(
  repoRoot: string,
  logDir: string,
  concurrency: number,
): Promise<FullTestSweep> {
  const buildOutcome = runCommand(
    "npx",
    ["turbo", "run", "build", "--force", `--concurrency=${concurrency}`],
    join(logDir, "build.log"),
    { cwd: repoRoot },
  );

  const packages = withScript(discoverPackages(repoRoot), "coverage");
  const packageOutcomes = await runPool(packages, concurrency, (pkg) =>
    runPackageCoverage(repoRoot, logDir, pkg.dir),
  );
  const root = runRootTests(repoRoot, logDir);

  const allEntries = [...packageOutcomes.flatMap((p) => p.entries), ...root.entries];
  const coverage = aggregateCoverage(
    packageOutcomes.map((p) => p.coverage).filter((c): c is CoverageTotals => c !== undefined),
  );

  return { buildOutcome, rootOutcome: root.outcome, packageOutcomes, allEntries, coverage };
}
