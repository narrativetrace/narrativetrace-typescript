// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClarityResult } from "../src/clarity-analyzer.js";
import { renderClaritySuiteReport } from "../src/clarity-report-renderer.js";

function result(overall: number, partial: Partial<ClarityResult> = {}): ClarityResult {
  return {
    overall,
    method: overall,
    class: overall,
    parameter: overall,
    structural: overall,
    cohesion: overall,
    issues: [],
    ...partial,
  };
}

describe("renderClaritySuiteReport", () => {
  test("empty suite renders just the header", () => {
    expect(renderClaritySuiteReport([])).toBe(
      [
        "# Clarity Suite Report",
        "",
        "## Scenarios",
        "",
        "| Scenario | Score |",
        "|----------|-------|",
      ].join("\n"),
    );
  });

  test("scenarios sort ascending by overall score with 2-dp scores", () => {
    const report = renderClaritySuiteReport([
      { scenario: "Alpha", result: result(0.9) },
      { scenario: "Bravo", result: result(0.5) },
    ]);
    const lines = report.split("\n");
    // Bravo (0.50) precedes Alpha (0.90) despite input order.
    expect(lines).toContain("| Bravo | 0.50 |");
    expect(lines).toContain("| Alpha | 0.90 |");
    expect(lines.indexOf("| Bravo | 0.50 |")).toBeLessThan(lines.indexOf("| Alpha | 0.90 |"));
  });

  test("renders a weighted detail block for scenarios below 0.7 with issues", () => {
    const report = renderClaritySuiteReport([
      {
        scenario: "Weak",
        result: result(0.4, {
          method: 0.4,
          class: 0.2,
          parameter: 0.6,
          structural: 1.0,
          cohesion: 0.7,
          issues: [
            {
              category: "class-name",
              element: "Helper",
              suggestion: "Use a domain-specific name",
              severity: "HIGH",
              occurrences: 2,
              impactScore: 6,
            },
          ],
        }),
      },
    ]);
    expect(report).toContain("### Weak");
    expect(report).toContain("| Category | Score | Weight | Weighted |");
    expect(report).toContain("| Method Names | 0.40 | 0.30 | 0.12 |");
    expect(report).toContain("| Class Names | 0.20 | 0.20 | 0.04 |");
    expect(report).toContain("| **Overall** | **0.40** | | |");
    expect(report).toContain("| Severity | Category | Element | Suggestion |");
    // Occurrences > 1 render an (xN) tag on the element.
    expect(report).toContain("| HIGH | class-name | `Helper` (x2) | Use a domain-specific name |");
  });

  test("scenarios at or above 0.7 get no detail block even with issues", () => {
    const report = renderClaritySuiteReport([
      {
        scenario: "Fine",
        result: result(0.8, {
          issues: [
            {
              category: "collocation",
              element: "X.y",
              suggestion: "Consider: z",
              severity: "LOW",
              occurrences: 1,
              impactScore: 1,
            },
          ],
        }),
      },
    ]);
    expect(report).not.toContain("### Fine");
    expect(report).not.toContain("## Scores");
  });

  test("duplicate scenario names are preserved as separate rows", () => {
    const report = renderClaritySuiteReport([
      { scenario: "Dup", result: result(0.5) },
      { scenario: "Dup", result: result(0.6) },
    ]);
    const rows = report.split("\n").filter((l) => l.startsWith("| Dup |"));
    expect(rows).toHaveLength(2);
  });

  test("single-occurrence issues render the element without an (xN) tag", () => {
    const report = renderClaritySuiteReport([
      {
        scenario: "One",
        result: result(0.3, {
          issues: [
            {
              category: "method-name",
              element: "A.b",
              suggestion: "s",
              severity: "MEDIUM",
              occurrences: 1,
              impactScore: 2,
            },
          ],
        }),
      },
    ]);
    expect(report).toContain("| MEDIUM | method-name | `A.b` | s |");
  });
});
