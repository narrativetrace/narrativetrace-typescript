// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { evaluateClarityGate } from "../src/clarity-gate.js";
import type { ScenarioResult } from "../src/clarity-report-renderer.js";

function entry(scenario: string, overall: number, high = 0): ScenarioResult {
  return {
    scenario,
    result: {
      overall,
      method: overall,
      class: overall,
      parameter: overall,
      structural: overall,
      cohesion: overall,
      issues: Array.from({ length: high }, (_, i) => ({
        category: "class-name",
        element: `E${i}`,
        suggestion: "s",
        severity: "HIGH" as const,
        occurrences: 1,
        impactScore: 3,
      })),
    },
  };
}

describe("evaluateClarityGate", () => {
  test("no thresholds → no violations", () => {
    expect(evaluateClarityGate([entry("A", 0.1, 5)], {})).toStrictEqual([]);
  });

  test("minScore flags every scenario below the floor", () => {
    const v = evaluateClarityGate([entry("A", 0.3), entry("B", 0.8)], { minScore: 0.5 });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("A");
  });

  test("maxHighIssues sums HIGH severity across scenarios", () => {
    const v = evaluateClarityGate([entry("A", 0.9, 2), entry("B", 0.9, 1)], { maxHighIssues: 2 });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("3 HIGH");
  });

  test("passing suite yields no violations", () => {
    expect(
      evaluateClarityGate([entry("A", 0.9)], { minScore: 0.4, maxHighIssues: 0 }),
    ).toStrictEqual([]);
  });
});
