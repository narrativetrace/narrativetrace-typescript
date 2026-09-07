// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClarityResult } from "../src/clarity-analyzer.js";
import { renderClarityReport } from "../src/clarity-report-renderer.js";

const goodResult: ClarityResult = {
  overall: 0.92,
  method: 0.95,
  class: 0.9,
  parameter: 0.88,
  structural: 1.0,
  cohesion: 0.85,
  issues: [],
};

const poorResult: ClarityResult = {
  overall: 0.35,
  method: 0.3,
  class: 0.4,
  parameter: 0.2,
  structural: 0.8,
  cohesion: 0.3,
  issues: [
    {
      category: "method-name",
      element: "DataManager.processData",
      suggestion: "Use a domain verb",
      severity: "HIGH",
      occurrences: 1,
      impactScore: 3,
    },
    {
      category: "param-name",
      element: "x",
      suggestion: "Use a descriptive name",
      severity: "HIGH",
      occurrences: 1,
      impactScore: 3,
    },
  ],
};

describe("ClarityReportRenderer", () => {
  test("produces valid markdown with header and table", () => {
    const report = renderClarityReport([
      { scenario: "Place order flow", result: goodResult },
      { scenario: "Process data flow", result: poorResult },
    ]);
    expect(report).toContain("# Clarity Report");
    expect(report).toContain("| Scenario");
    expect(report).toContain("Place order flow");
    expect(report).toContain("Process data flow");
  });

  test("includes issues section when issues exist", () => {
    const report = renderClarityReport([{ scenario: "Test", result: poorResult }]);
    expect(report).toContain("## Issues");
    expect(report).toContain("processData");
    expect(report).toContain("[!!!]");
  });

  test("omits issues section when no issues exist", () => {
    const report = renderClarityReport([{ scenario: "Test", result: goodResult }]);
    expect(report).not.toContain("## Issues");
  });

  test("renders medium severity icon as [!!]", () => {
    const result: ClarityResult = {
      ...goodResult,
      issues: [
        {
          category: "class-name",
          element: "Manager",
          suggestion: "Rename it",
          severity: "MEDIUM",
          occurrences: 1,
          impactScore: 2,
        },
      ],
    };
    const report = renderClarityReport([{ scenario: "Test", result }]);
    expect(report).toContain("[!!]");
  });

  test("renders low severity icon as [!] and an (xN) occurrences tag", () => {
    const result: ClarityResult = {
      ...goodResult,
      issues: [
        {
          category: "collocation",
          element: "Svc.swimOrder",
          suggestion: "Consider renaming",
          severity: "LOW",
          occurrences: 3,
          impactScore: 3,
        },
      ],
    };
    const report = renderClarityReport([{ scenario: "Test", result }]);
    expect(report).toContain("[!]");
    expect(report).toContain("(x3)");
  });

  test("formats scores as percentages", () => {
    const report = renderClarityReport([{ scenario: "Test", result: goodResult }]);
    expect(report).toContain("92%");
    expect(report).toContain("95%");
  });
});
