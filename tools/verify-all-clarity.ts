// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { type CommandOutcome, extractJsonObject, runCommand } from "./verify-all-exec.js";

interface ClarityIssue {
  readonly severity: string;
}

interface ClarityScenario {
  readonly overallScore: number;
  readonly issues: readonly ClarityIssue[];
}

interface ClarityJsonReport {
  readonly scenarios: readonly ClarityScenario[];
}

export interface ClarityOutcome {
  readonly outcome: CommandOutcome;
  readonly averageScore: number | undefined;
  readonly highIssues: number;
  readonly scenariosScanned: number;
}

function parseReport(output: string): ClarityJsonReport | undefined {
  // `--json` prints the pretty-printed report as the tool's own stdout; `evaluateClarityGate`'s
  // violations (if any) go to stderr afterward.
  const json = extractJsonObject(output);
  if (!json) return undefined;
  try {
    return JSON.parse(json) as ClarityJsonReport;
  } catch {
    return undefined;
  }
}

function averageScore(scenarios: readonly ClarityScenario[]): number | undefined {
  if (scenarios.length === 0) return undefined;
  const total = scenarios.reduce((sum, s) => sum + s.overallScore, 0);
  return total / scenarios.length;
}

/**
 * Runs the repo's own in-house naming/readability self-gate (`tools/clarity-scan.ts`, the exact
 * thresholds `pnpm run clarity:gate` already enforces per commit) with `--json` added so this row
 * gets a real `score` metric instead of leaving it out. Unlike Java, `ts`/`python`/`swift` each
 * carry this tool — see `reports/verification/SCHEMA.md`'s worked `not-implemented` example.
 */
export function runClarityScan(repoRoot: string, logDir: string): ClarityOutcome {
  const outcome = runCommand(
    "npx",
    ["tsx", "tools/clarity-scan.ts", "--min-score", "0.4", "--max-high-issues", "15", "--json"],
    join(logDir, "clarity.log"),
    { cwd: repoRoot },
  );
  const report = parseReport(outcome.output);
  const scenarios = report?.scenarios ?? [];
  const highIssues = scenarios.reduce(
    (sum, s) => sum + s.issues.filter((i) => i.severity === "HIGH").length,
    0,
  );
  return {
    outcome,
    averageScore: averageScore(scenarios),
    highIssues,
    scenariosScanned: scenarios.length,
  };
}
