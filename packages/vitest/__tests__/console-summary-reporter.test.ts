// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { ConsoleSummaryReporter } from "../src/console-summary-reporter.js";

const reporter = new ConsoleSummaryReporter();

describe("ConsoleSummaryReporter", () => {
  test("formats a passing result without clarity", () => {
    expect(reporter.formatTestResult("t", 12)).toBe("    ✓ t (12ms)");
  });

  test("formats a passing result with a 2-dp clarity score", () => {
    expect(reporter.formatTestResult("t", 12, 0.5)).toBe("    ✓ t (12ms, clarity: 0.50)");
  });

  test("formats a 3-line failure block", () => {
    expect(reporter.formatTestFailure("t", 5, "AssertionError", "file.ts:10", "traces/t.md")).toBe(
      [
        "    ✗ t (5ms)",
        "      > AssertionError at file.ts:10",
        "      > Full trace: traces/t.md",
      ].join("\n"),
    );
  });

  test("formats the suite header", () => {
    expect(reporter.formatSuiteHeader()).toBe("NarrativeTrace — Recording test narratives\n");
  });

  test("formats the footer without clarity scores", () => {
    expect(reporter.formatSuiteFooter(3, "out/")).toBe(
      "\nNarrativeTrace — Suite complete\n  3 scenarios recorded\n  Reports: out/",
    );
  });

  test("formats the footer with a high/moderate/low clarity split at 0.7/0.4", () => {
    expect(reporter.formatSuiteFooter(4, "out/", [0.9, 0.7, 0.5, 0.2])).toBe(
      "\nNarrativeTrace — Suite complete\n  4 scenarios recorded\n" +
        "  Clarity: 50% high | 25% moderate | 25% low\n  Reports: out/",
    );
  });

  test("empty clarity list reports 0% in every band without dividing by zero", () => {
    expect(reporter.formatSuiteFooter(0, "out/", [])).toContain(
      "Clarity: 0% high | 0% moderate | 0% low",
    );
  });
});
