// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClarityIssue, ClarityResult } from "../src/clarity-analyzer.js";
import { exportClarityJson, exportClarityJsonReport } from "../src/clarity-json-export.js";

function makeResult(overrides: Partial<ClarityResult> = {}): ClarityResult {
  return {
    overall: 0.85,
    method: 0.9,
    class: 0.95,
    parameter: 0.8,
    structural: 1.0,
    cohesion: 0.7,
    issues: [],
    ...overrides,
  };
}

function issue(overrides: Partial<ClarityIssue> = {}): ClarityIssue {
  return {
    category: "method-name",
    element: "OrderService.process",
    suggestion: "Use a domain-specific verb+noun",
    severity: "HIGH",
    occurrences: 1,
    impactScore: 3,
    ...overrides,
  };
}

describe("exportClarityJson", () => {
  test("emits Java's flat *Score keys under a scenarios array (cross-language contract)", () => {
    const parsed = JSON.parse(
      exportClarityJson(makeResult(), { scenario: "Customer places order" }),
    );

    expect(parsed.version).toBe("1.0");
    expect(parsed.scenarios).toHaveLength(1);
    const scenario = parsed.scenarios[0];
    expect(scenario.name).toBe("Customer places order");
    expect(scenario.overallScore).toBe(0.85);
    expect(scenario.methodNameScore).toBe(0.9);
    expect(scenario.classNameScore).toBe(0.95);
    expect(scenario.parameterNameScore).toBe(0.8);
    expect(scenario.structuralScore).toBe(1.0);
    expect(scenario.cohesionScore).toBe(0.7);
  });

  test("scores are rounded to 2 decimals like Java's %.2f", () => {
    const parsed = JSON.parse(
      exportClarityJson(makeResult({ overall: 0.856789 }), { scenario: "s" }),
    );
    expect(parsed.scenarios[0].overallScore).toBe(0.86);
  });

  test("issues carry category/element/suggestion/severity/occurrences/impactScore", () => {
    const result = makeResult({
      issues: [
        issue(),
        issue({
          category: "collocation",
          element: "OrderService.swimOrder",
          severity: "LOW",
          occurrences: 2,
          impactScore: 2,
        }),
      ],
    });
    const parsed = JSON.parse(exportClarityJson(result, { scenario: "test" }));

    expect(parsed.scenarios[0].issues).toEqual([
      {
        category: "method-name",
        element: "OrderService.process",
        suggestion: "Use a domain-specific verb+noun",
        severity: "HIGH",
        occurrences: 1,
        impactScore: 3,
      },
      {
        category: "collocation",
        element: "OrderService.swimOrder",
        suggestion: "Use a domain-specific verb+noun",
        severity: "LOW",
        occurrences: 2,
        impactScore: 2,
      },
    ]);
  });

  test("a Java-shaped consumer parses the document (golden contract)", () => {
    const parsed = JSON.parse(
      exportClarityJson(makeResult({ issues: [issue()] }), { scenario: "s" }),
    );
    // Shape a Gradle-plugin-style consumer relies on.
    expect(Object.keys(parsed)).toEqual(["version", "scenarios"]);
    const s = parsed.scenarios[0];
    expect(Object.keys(s)).toEqual([
      "name",
      "overallScore",
      "methodNameScore",
      "classNameScore",
      "parameterNameScore",
      "structuralScore",
      "cohesionScore",
      "issues",
    ]);
    expect(typeof s.overallScore).toBe("number");
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(s.issues[0].severity);
  });
});

describe("exportClarityJsonReport", () => {
  test("produces empty scenarios array for empty input", () => {
    const parsed = JSON.parse(exportClarityJsonReport([]));
    expect(parsed.version).toBe("1.0");
    expect(parsed.scenarios).toEqual([]);
  });

  test("serializes multiple scenarios preserving order", () => {
    const results = [
      { scenario: "Place order", result: makeResult({ overall: 0.9 }) },
      { scenario: "Cancel order", result: makeResult({ overall: 0.7 }) },
    ];
    const parsed = JSON.parse(exportClarityJsonReport(results));

    expect(parsed.version).toBe("1.0");
    expect(parsed.scenarios).toHaveLength(2);
    expect(parsed.scenarios[0].name).toBe("Place order");
    expect(parsed.scenarios[0].overallScore).toBe(0.9);
    expect(parsed.scenarios[1].name).toBe("Cancel order");
    expect(parsed.scenarios[1].overallScore).toBe(0.7);
  });
});
