// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioResult } from "./clarity-report-renderer.js";

export type ClarityGateThresholds = {
  readonly minScore?: number | undefined;
  readonly maxHighIssues?: number | undefined;
};

function countHighIssues(entries: readonly ScenarioResult[]): number {
  return entries.reduce(
    (sum, e) => sum + e.result.issues.filter((i) => i.severity === "HIGH").length,
    0,
  );
}

/**
 * Evaluates the clarity build gate over accumulated scenarios and returns a human-readable list of
 * violations (empty = pass). Shared by the file-reading CLI and the source-scan tool so both gate
 * identically. `minScore` fails any scenario below the floor; `maxHighIssues` caps the total number
 * of HIGH-severity issues across the suite.
 */
export function evaluateClarityGate(
  entries: readonly ScenarioResult[],
  thresholds: ClarityGateThresholds,
): string[] {
  return [
    ...highIssueViolations(entries, thresholds.maxHighIssues),
    ...lowScoreViolations(entries, thresholds.minScore),
  ];
}

/** Suite-wide cap on HIGH-severity issues; an unset threshold gates nothing. */
function highIssueViolations(entries: readonly ScenarioResult[], max?: number): string[] {
  if (max === undefined) return [];
  const high = countHighIssues(entries);
  return high > max ? [`${high} HIGH-severity issue(s) exceed the limit of ${max}`] : [];
}

/** Per-scenario score floor; an unset threshold gates nothing. */
function lowScoreViolations(entries: readonly ScenarioResult[], min?: number): string[] {
  if (min === undefined) return [];
  return entries
    .filter(({ result }) => result.overall < min)
    .map(
      ({ scenario, result }) =>
        `Scenario "${scenario}" scored ${result.overall.toFixed(2)} (< ${min})`,
    );
}
