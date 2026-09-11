// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { type CommandOutcome, readJsonOrUndefined, runCommand } from "./verify-all-exec.js";

interface BenchGateResult {
  readonly overall: "pass" | "fail" | "no-baseline";
  readonly regressed: readonly unknown[];
  readonly ok: readonly unknown[];
  readonly newBenchmarks: readonly unknown[];
}

export interface BenchOutcome {
  readonly outcome: CommandOutcome;
  readonly benchmarksRun: number;
  readonly regressions: number;
  readonly overall: BenchGateResult["overall"] | "unknown";
}

const GATE_RESULT_PATH = "reports/benchmarks/gate-result.json";

function benchmarksRun(gate: BenchGateResult | undefined): number {
  if (!gate) return 0;
  return gate.regressed.length + gate.ok.length + gate.newBenchmarks.length;
}

/**
 * Runs the repo's own nightly benchmark entry point (`scripts/save-bench.sh`): `vitest bench`,
 * a dated snapshot saved to `reports/benchmarks/`, then `tools/bench-gate.ts` comparing it
 * against the previous run's `latest.json`. Reuses the real tool end to end rather than
 * reimplementing the comparison — `gate-result.json` is that tool's own structured verdict, read
 * back afterward exactly the way `renderMarkdown` reads the verification JSON back.
 */
export function runBenchmarkSweep(repoRoot: string, logDir: string): BenchOutcome {
  const outcome = runCommand("bash", ["scripts/save-bench.sh"], join(logDir, "benchmarks.log"), {
    cwd: repoRoot,
  });
  const gate = readJsonOrUndefined<BenchGateResult>(join(repoRoot, GATE_RESULT_PATH));
  return {
    outcome,
    benchmarksRun: benchmarksRun(gate),
    regressions: gate?.regressed.length ?? 0,
    overall: gate?.overall ?? "unknown",
  };
}
