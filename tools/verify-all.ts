// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchOutcome } from "./verify-all-bench.js";
import { runBenchmarkSweep } from "./verify-all-bench.js";
import type { BiomeSweep } from "./verify-all-biome.js";
import { runBiomeSweep } from "./verify-all-biome.js";
import type { ClarityOutcome } from "./verify-all-clarity.js";
import { runClarityScan } from "./verify-all-clarity.js";
import {
  type CommandOutcome,
  hostDescriptor,
  repoVersion,
  runCommand,
  shortCommit,
  withLogHint,
} from "./verify-all-exec.js";
import type { MetricsOutcome } from "./verify-all-metrics.js";
import { runMetricsGate } from "./verify-all-metrics.js";
import type { MutationOutcome } from "./verify-all-mutation.js";
import { mutationScore, runMutationSweep } from "./verify-all-mutation.js";
import type { CategoryResult, VerificationRun } from "./verify-all-schema.js";
import { renderMarkdown, writeVerificationJson } from "./verify-all-schema.js";
import type { SastOutcome, ScaOutcome, SecretsOutcome } from "./verify-all-security.js";
import { runSastScan, runScaScan, runSecretsScan } from "./verify-all-security.js";
import type { StressLongOutcome } from "./verify-all-stress.js";
import { runStressLongSweep } from "./verify-all-stress.js";
import { type FullTestSweep, runFullTestSweep } from "./verify-all-testrun.js";
import type { TypecheckOutcome } from "./verify-all-typecheck.js";
import { runTypecheckSweep } from "./verify-all-typecheck.js";
import {
  allGreen,
  matchingModule,
  matchingPath,
  summarize,
  type TestFileEntry,
  totalSeconds,
} from "./verify-all-vitest.js";

const REPO_ROOT = process.cwd();
const LOG_DIR = join(REPO_ROOT, ".verify-all-logs");
const CONCURRENCY = Number(process.env.TURBO_CONCURRENCY) || 4;

function printBanner(): void {
  const bar = "=".repeat(100);
  console.log(bar);
  console.log("verify:all: running every verification this repo has, gate and heavy alike.");
  console.log("This is LONG-RUNNING BY DESIGN (mutation testing across ~19 packages, coverage");
  console.log("across every package, and a budgeted stress sweep are each historically several");
  console.log("minutes on this project's own dev container). A category's failure never aborts");
  console.log("the run — see reports/verification/SCHEMA.md for how to read the report it writes.");
  console.log(bar);
}

function resolveTsVersion(repoRoot: string): string {
  try {
    const raw = readFileSync(join(repoRoot, "node_modules/typescript/package.json"), "utf-8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "5.x";
  }
}

// ---------------------------------------------------------------------- static-analysis builders

function statusFromFindings(findings: number | undefined): "passed" | "failed" {
  return (findings ?? 0) > 0 ? "failed" : "passed";
}

function buildFormatRow(biome: BiomeSweep): CategoryResult {
  const status = statusFromFindings(biome.formatFindings);
  const note =
    "sliced from the same `biome check` run as the lint row below — 0 additional invocations";
  return {
    category: "format",
    tool: "Biome 2.4.4 (formatter)",
    status,
    metrics: {},
    durationSeconds: biome.outcome.seconds,
    note: withLogHint(note, biome.outcome, status),
  };
}

function buildLintRow(biome: BiomeSweep): CategoryResult {
  // `findings` is the raw total (any severity); status follows only the error-severity subset —
  // see runBiomeSweep's doc comment for why that, not a bare findings>0 rule, matches the real gate.
  const status = statusFromFindings(biome.lintErrors);
  return {
    category: "lint",
    tool: "Biome 2.4.4 (linter, recommended rules)",
    status,
    metrics: { findings: biome.lintFindings ?? 0, error_severity_findings: biome.lintErrors ?? 0 },
    durationSeconds: biome.outcome.seconds,
    note: withLogHint(null, biome.outcome, status),
  };
}

function buildComplexityRow(metrics: MetricsOutcome): CategoryResult {
  const status = statusFromFindings(metrics.findings);
  return {
    category: "complexity",
    tool: "tools/metrics.ts (hard gate ≤20 lines/function, packages/*/src)",
    status,
    metrics: { findings: metrics.findings },
    durationSeconds: metrics.outcome.seconds,
    note: withLogHint(null, metrics.outcome, status),
  };
}

function buildSastRow(sast: SastOutcome): CategoryResult {
  const status: CategoryResult["status"] = sast.skipped
    ? "skipped"
    : statusFromFindings(sast.findings);
  const metrics: Record<string, number> =
    sast.findings === undefined ? {} : { findings: sast.findings };
  const note = sast.skipped
    ? "semgrep not resolvable on PATH or in .tools-cache/ — see scripts/semgrep-scan.sh"
    : null;
  return {
    category: "sast",
    tool: "Semgrep (p/security-audit + p/typescript + p/javascript + p/owasp-top-ten)",
    status,
    metrics,
    durationSeconds: sast.outcome.seconds,
    note: withLogHint(note, sast.outcome, status),
  };
}

function buildSecretsRow(secrets: SecretsOutcome): CategoryResult {
  const status: CategoryResult["status"] = secrets.skipped
    ? "skipped"
    : secrets.outcome.exitCode === 0
      ? "passed"
      : "failed";
  const note = secrets.skipped
    ? "gitleaks binary not on PATH and self-install did not succeed"
    : null;
  return {
    category: "secrets",
    tool: "gitleaks (full git history)",
    status,
    metrics: {},
    durationSeconds: secrets.outcome.seconds,
    note: withLogHint(note, secrets.outcome, status),
  };
}

function scaStatus(sca: ScaOutcome): CategoryResult["status"] {
  const osvFailed = !sca.osv.skipped && (sca.osv.findings ?? 0) > 0;
  const auditFailed = sca.pnpmAudit.outcome.exitCode !== 0;
  if (sca.osv.skipped) return auditFailed ? "failed" : "passed";
  return osvFailed || auditFailed ? "failed" : "passed";
}

function scaNote(sca: ScaOutcome): string {
  const meaning = sca.osv.skipped
    ? "osv-scanner not resolvable on PATH or in .tools-cache/"
    : "findings = distinct OSV ids from `osv-scanner scan source --recursive` over pnpm-lock.yaml; " +
      "findings_pnpm_audit = pnpm audit's own advisory count over the same lockfile";
  const logs = [sca.osv.outcome.logFile, sca.pnpmAudit.outcome.logFile].join(", ");
  return `${meaning}; full output: ${logs}`;
}

function buildScaRow(sca: ScaOutcome): CategoryResult {
  const metrics: Record<string, number> = {};
  if (sca.osv.findings !== undefined) metrics.findings = sca.osv.findings;
  if (sca.pnpmAudit.findings !== undefined) metrics.findings_pnpm_audit = sca.pnpmAudit.findings;
  return {
    category: "sca",
    tool: "OSV-Scanner (source scan over pnpm-lock.yaml) + pnpm audit",
    status: scaStatus(sca),
    metrics,
    durationSeconds: sca.osv.outcome.seconds + sca.pnpmAudit.outcome.seconds,
    note: scaNote(sca),
  };
}

function buildTranslationRow(outcome: CommandOutcome): CategoryResult {
  const status: CategoryResult["status"] = outcome.exitCode === 0 ? "passed" : "failed";
  return {
    category: "translation",
    tool: "custom translation-check (blob-hash headers + i18n manifest)",
    status,
    metrics: {},
    durationSeconds: outcome.seconds,
    note: withLogHint(null, outcome, status),
  };
}

function typesNote(tc: TypecheckOutcome): string {
  if (tc.packagesFailed.length === 0) {
    return (
      "tsc --noEmit per package tsconfig — this port's real build step (tsup/esbuild) strips " +
      "types without checking them, so this is a genuinely additional check, not a redundant one"
    );
  }
  return `failing packages: ${tc.packagesFailed.join(", ")}; see ${tc.failingLogFiles.join(", ")}`;
}

function buildTypesRow(tc: TypecheckOutcome, tsVersion: string): CategoryResult {
  const status: CategoryResult["status"] = tc.packagesFailed.length === 0 ? "passed" : "failed";
  return {
    category: "types",
    tool: `TypeScript ${tsVersion} (tsc --noEmit, ${tc.packagesChecked} package tsconfigs)`,
    status,
    metrics: { findings: tc.findings },
    durationSeconds: tc.seconds,
    note: typesNote(tc),
  };
}

function buildClarityRow(clarity: ClarityOutcome): CategoryResult {
  const status: CategoryResult["status"] = clarity.outcome.exitCode === 0 ? "passed" : "failed";
  const metrics: Record<string, number> = { high_issues: clarity.highIssues };
  if (clarity.averageScore !== undefined) metrics.score = clarity.averageScore;
  const note = `${clarity.scenariosScanned} class(es) scanned`;
  return {
    category: "clarity",
    tool: "custom clarity-scan.ts (min-score 0.4, max-high-issues 15)",
    status,
    metrics,
    durationSeconds: clarity.outcome.seconds,
    note: withLogHint(note, clarity.outcome, status),
  };
}

// ------------------------------------------------------------------- test/coverage-derived builders

function buildUnitTestsRow(sweep: FullTestSweep): CategoryResult {
  const status: CategoryResult["status"] = allGreen(sweep.allEntries) ? "passed" : "failed";
  const note =
    "every package's own `vitest run --coverage` plus the root suite (architecture, tooling self-tests)";
  return {
    category: "unit-tests",
    tool: "Vitest 3.2.7",
    status,
    metrics: { ...summarize(sweep.allEntries) },
    durationSeconds: totalSeconds(sweep.allEntries),
    note,
  };
}

function buildCoverageRow(sweep: FullTestSweep): CategoryResult {
  const failed = sweep.packageOutcomes.some((p) => p.outcome.exitCode !== 0);
  const tool =
    "@vitest/coverage-v8 3.2.7 (98/98/98/98 baseline, per-package ratchets — see vitest.coverage.shared.ts)";
  return {
    category: "coverage",
    tool,
    status: failed ? "failed" : "passed",
    metrics: {
      coverage_pct: sweep.coverage.coveragePct,
      lines_covered: sweep.coverage.linesCovered,
      lines_missed: sweep.coverage.linesMissed,
    },
    durationSeconds: 0,
    note: "derived from the same per-package vitest runs as unit-tests above — 0 additional invocations",
  };
}

function derivedRow(
  category: CategoryResult["category"],
  tool: string,
  entries: readonly TestFileEntry[],
  note: string,
): CategoryResult {
  const status: CategoryResult["status"] = allGreen(entries) ? "passed" : "failed";
  const metrics = { ...summarize(entries) };
  return { category, tool, status, metrics, durationSeconds: totalSeconds(entries), note };
}

function buildPropertyRow(sweep: FullTestSweep): CategoryResult {
  const entries = matchingPath(sweep.allEntries, ".prop.test.ts");
  const note =
    "sliced from the unit-tests row's own runs: every *.prop.test.ts file repo-wide — 0 additional invocations";
  return derivedRow("property", "fast-check 4.5.3 (vitest)", entries, note);
}

function buildFuzzTierARow(sweep: FullTestSweep): CategoryResult {
  const entries = matchingModule(sweep.allEntries, "security-tests");
  const tool = "fast-check 4.5.3 hostile-corpus properties + Jazzer.js seed regression-replay";
  const note =
    "sliced from the unit-tests row's own run: the whole @narrativetrace/security-tests suite " +
    "(fast-check properties fed by the shared hostile corpus, plus __tests__/fuzz-regression.test.ts's " +
    "seed replay) — 0 additional invocations";
  return derivedRow("fuzz-tier-a", tool, entries, note);
}

function buildArchitectureRow(sweep: FullTestSweep): CategoryResult {
  const entries = matchingPath(sweep.allEntries, "__tests__/architecture.test.ts");
  const tool = "tsarch 5.4.1 + hand-written import-boundary rules (__tests__/architecture.test.ts)";
  return derivedRow(
    "architecture",
    tool,
    entries,
    "sliced from the root suite's own run — 0 additional invocations",
  );
}

function buildConformanceRow(sweep: FullTestSweep): CategoryResult {
  const entries = matchingPath(sweep.allEntries, "canonical-schema-conformance.test.ts");
  const tool =
    "custom canonical-schema-conformance.test.ts (validates writeTraceOutput's actual bytes)";
  const note =
    "sliced from the unit-tests row's own @narrativetrace/vitest package run — 0 additional invocations";
  return derivedRow("conformance", tool, entries, note);
}

function buildStressShortRow(sweep: FullTestSweep): CategoryResult {
  const entries = matchingPath(sweep.allEntries, "__tests__/stress/");
  const tool = "Vitest 3.2.7 (packages/core/__tests__/stress/*.stress.test.ts, fixed seed)";
  const note =
    "sliced from the unit-tests row's own @narrativetrace/core package run — 0 additional invocations";
  return derivedRow("stress-short", tool, entries, note);
}

// -------------------------------------------------------------------------------- heavy builders

function buildMutationRow(mutation: MutationOutcome): CategoryResult {
  const status: CategoryResult["status"] = mutation.exitCode === 0 ? "passed" : "failed";
  const score = mutationScore(mutation.counts);
  const missing = mutation.packagesRun - mutation.packagesWithReport;
  const note =
    missing > 0
      ? `only ${mutation.packagesWithReport}/${mutation.packagesRun} packages produced reports/mutation/mutation.json`
      : null;
  const tool = `Stryker 9.6.0 (${mutation.packagesRun} packages, --concurrency=1, per-package thresholds.break, non-incremental)`;
  return {
    category: "mutation",
    tool,
    status,
    metrics: {
      mutants_killed: mutation.counts.killed,
      mutants_survived: mutation.counts.survived,
      mutants_no_coverage: mutation.counts.noCoverage,
      mutants_timeout: mutation.counts.timeout,
      mutation_score: score,
    },
    durationSeconds: mutation.seconds,
    note: note ?? (status === "passed" ? null : `full output: ${mutation.logFile}`),
  };
}

const FUZZ_TIER_B_SKIP = /Tier B.*skipped:.*/i;
const FUZZ_TARGET_LINE = /=== fuzzing (\S+) for/g;
const FUZZ_DONE_LINE = /Done (\d+) runs in/g;

function buildFuzzTierBRow(outcome: CommandOutcome): CategoryResult {
  const skipMatch = FUZZ_TIER_B_SKIP.exec(outcome.output);
  const targetsFuzzed = new Set([...outcome.output.matchAll(FUZZ_TARGET_LINE)].map((m) => m[1]))
    .size;
  const executions = [...outcome.output.matchAll(FUZZ_DONE_LINE)].reduce(
    (sum, m) => sum + Number(m[1]),
    0,
  );
  const status: CategoryResult["status"] = skipMatch
    ? "skipped"
    : outcome.exitCode === 0
      ? "passed"
      : "failed";
  const metrics: Record<string, number> =
    status === "skipped" ? {} : { executions, targets_fuzzed: targetsFuzzed, targets_total: 2 };
  return {
    category: "fuzz-tier-b",
    tool: "Jazzer.js (@jazzer.js/core, coverage-guided, 2 targets x 5m/target)",
    status,
    metrics,
    durationSeconds: outcome.seconds,
    note: skipMatch ? skipMatch[0] : withLogHint(null, outcome, status),
  };
}

function buildBenchmarksRow(bench: BenchOutcome): CategoryResult {
  const status: CategoryResult["status"] = bench.outcome.exitCode === 0 ? "passed" : "failed";
  const tool =
    "Vitest bench (tinybench) vs reports/benchmarks/latest.json, tools/bench-gate.ts (20% or 3x noise floor)";
  const note = bench.overall === "no-baseline" ? "no prior baseline — bootstrapped" : null;
  return {
    category: "benchmarks",
    tool,
    status,
    metrics: { benchmarks_run: bench.benchmarksRun, regressions: bench.regressions },
    durationSeconds: bench.outcome.seconds,
    note: withLogHint(note, bench.outcome, status),
  };
}

function buildAllocationRow(): CategoryResult {
  const note =
    "no allocation-rate/GC-profiler benchmark distinct from throughput exists for this port — " +
    "packages/benchmarks + tools/bench-gate.ts (see the benchmarks row) measure wall-clock time only";
  return {
    category: "allocation",
    tool: "none",
    status: "not-implemented",
    metrics: {},
    durationSeconds: 0,
    note,
  };
}

function buildStressLongRow(stress: StressLongOutcome): CategoryResult {
  const status: CategoryResult["status"] = stress.outcome.exitCode === 0 ? "passed" : "failed";
  const tool = `Vitest 3.2.7 (packages/core/tools/run-stress.ts, fresh random seed each iteration, ${stress.budgetSeconds}s budget)`;
  const note =
    "NARRATIVETRACE_STRESS_BUDGET_SECONDS controls the budget; unset here means the real default, not a time-box override";
  return {
    category: "stress-long",
    tool,
    status,
    metrics: {},
    durationSeconds: stress.outcome.seconds,
    note: withLogHint(note, stress.outcome, status),
  };
}

// --------------------------------------------------------------------------------------- main

async function runStaticAndSecurityCategories(
  addRow: (row: CategoryResult) => void,
): Promise<void> {
  const biome = runBiomeSweep(REPO_ROOT, LOG_DIR);
  addRow(buildFormatRow(biome));
  addRow(buildLintRow(biome));
  addRow(buildComplexityRow(runMetricsGate(REPO_ROOT, LOG_DIR)));
  addRow(buildSastRow(runSastScan(REPO_ROOT, LOG_DIR)));
  addRow(buildSecretsRow(runSecretsScan(REPO_ROOT, LOG_DIR)));
  addRow(buildScaRow(runScaScan(REPO_ROOT, LOG_DIR)));
  const translation = runCommand(
    "npx",
    ["tsx", "tools/translation-check.ts"],
    join(LOG_DIR, "translation.log"),
    { cwd: REPO_ROOT },
  );
  addRow(buildTranslationRow(translation));
  const tc = await runTypecheckSweep(REPO_ROOT, LOG_DIR, CONCURRENCY);
  addRow(buildTypesRow(tc, resolveTsVersion(REPO_ROOT)));
  addRow(buildClarityRow(runClarityScan(REPO_ROOT, LOG_DIR)));
}

function addTestDerivedRows(sweep: FullTestSweep, addRow: (row: CategoryResult) => void): void {
  addRow(buildUnitTestsRow(sweep));
  addRow(buildPropertyRow(sweep));
  addRow(buildFuzzTierARow(sweep));
  addRow(buildArchitectureRow(sweep));
  addRow(buildConformanceRow(sweep));
  addRow(buildCoverageRow(sweep));
  addRow(buildStressShortRow(sweep));
}

async function runHeavyCategories(addRow: (row: CategoryResult) => void): Promise<void> {
  addRow(buildMutationRow(runMutationSweep(REPO_ROOT, LOG_DIR)));
  const fuzzTierB = runCommand(
    "pnpm",
    ["--filter", "@narrativetrace/security-tests", "run", "fuzz"],
    join(LOG_DIR, "fuzz-tier-b.log"),
    { cwd: REPO_ROOT },
  );
  addRow(buildFuzzTierBRow(fuzzTierB));
  addRow(buildBenchmarksRow(runBenchmarkSweep(REPO_ROOT, LOG_DIR)));
  addRow(buildAllocationRow());
  addRow(buildStressLongRow(runStressLongSweep(REPO_ROOT, LOG_DIR)));
}

function writeReport(startedAt: Date, results: readonly CategoryResult[]): string {
  const run: VerificationRun = {
    runtime: "typescript",
    version: repoVersion(REPO_ROOT),
    commit: shortCommit(REPO_ROOT),
    host: hostDescriptor(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    categories: results,
  };
  const dateStr = startedAt.toISOString().slice(0, 10);
  const jsonFile = join(REPO_ROOT, `reports/verification/${dateStr}.json`);
  const mdFile = join(REPO_ROOT, `reports/verification/${dateStr}.md`);
  writeVerificationJson(run, jsonFile);
  writeFileSync(mdFile, renderMarkdown(jsonFile));
  console.log(`\n${renderMarkdown(jsonFile)}`);
  console.log(`verify:all: wrote ${jsonFile} and ${mdFile}`);
  return mdFile;
}

async function main(): Promise<void> {
  printBanner();
  const startedAt = new Date();
  const results: CategoryResult[] = [];
  const addRow = (row: CategoryResult): void => {
    results.push(row);
    const elapsed = Math.round((Date.now() - startedAt.getTime()) / 1000);
    console.log(
      `[${elapsed}s elapsed] ${row.category.padEnd(14)} ${row.status.padEnd(15)} ` +
        `(${row.durationSeconds.toFixed(1)}s)  ${row.note ?? ""}`,
    );
  };

  await runStaticAndSecurityCategories(addRow);
  const sweep = await runFullTestSweep(REPO_ROOT, LOG_DIR, CONCURRENCY);
  addTestDerivedRows(sweep, addRow);
  await runHeavyCategories(addRow);

  const mdFile = writeReport(startedAt, results);
  const failedCount = results.filter((r) => r.status === "failed").length;
  if (failedCount > 0) {
    console.error(
      `\nverify:all: ${failedCount} of ${results.length} categories failed — see ${mdFile}`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
