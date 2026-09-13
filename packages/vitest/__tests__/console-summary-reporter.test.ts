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

  // 2026-09-13 ruling, item 2: the enclosing test-suite run's own name, right after the header.
  describe("run name", () => {
    test("adds a 'run: <name>' line right after the header, before the scenario count", () => {
      expect(reporter.formatSuiteFooter(3, "out/", undefined, "bold elk soars")).toBe(
        "\nNarrativeTrace — Suite complete\n  run: bold elk soars\n  3 scenarios recorded\n  Reports: out/",
      );
    });

    test("adds the run line ahead of the clarity split too", () => {
      const footer = reporter.formatSuiteFooter(1, "out/", [0.9], "bold elk soars");
      const lines = footer.split("\n");
      expect(lines[2]).toBe("  run: bold elk soars");
      expect(lines[3]).toBe("  1 scenarios recorded");
    });

    test("omits the run line entirely outside a tracked run", () => {
      expect(reporter.formatSuiteFooter(3, "out/")).not.toContain("run:");
    });
  });

  describe("formatDeltaLine", () => {
    test("is empty for an empty scenario list", () => {
      expect(reporter.formatDeltaLine([])).toBe("");
    });

    test("names 'scenario(s)' only on the first segment", () => {
      const deltas = [
        { scenario: "A", kind: "unchanged" as const, summary: "", diff: "" },
        { scenario: "B", kind: "new" as const, summary: "", diff: "" },
      ];
      expect(reporter.formatDeltaLine(deltas)).toBe("1 scenario unchanged · 1 new");
    });

    test("pluralizes 'scenarios' for more than one of the first kind", () => {
      const deltas = [
        { scenario: "A", kind: "unchanged" as const, summary: "", diff: "" },
        { scenario: "B", kind: "unchanged" as const, summary: "", diff: "" },
      ];
      expect(reporter.formatDeltaLine(deltas)).toBe("2 scenarios unchanged");
    });

    test("names each changed scenario with its summary", () => {
      const deltas = [
        {
          scenario: "Customer places order",
          kind: "changed" as const,
          summary: "+1 call InventoryService.release",
          diff: "",
        },
      ];
      expect(reporter.formatDeltaLine(deltas)).toBe(
        '1 scenario changed: "Customer places order" (+1 call InventoryService.release)',
      );
    });

    test("truncates a scenario name over 32 characters with an ellipsis", () => {
      const deltas = [
        {
          scenario: "Weekend trip settles with three transfers",
          kind: "changed" as const,
          summary: "+1 call X.y",
          diff: "",
        },
      ];
      const line = reporter.formatDeltaLine(deltas);
      expect(line).toContain('"Weekend trip settles with three…"');
    });

    test("joins unchanged, new and changed segments with the middle dot", () => {
      const deltas = [
        { scenario: "A", kind: "unchanged" as const, summary: "", diff: "" },
        { scenario: "B", kind: "new" as const, summary: "", diff: "" },
        { scenario: "C", kind: "changed" as const, summary: "+1 call X.y", diff: "" },
      ];
      expect(reporter.formatDeltaLine(deltas)).toBe(
        '1 scenario unchanged · 1 new · 1 changed: "C" (+1 call X.y)',
      );
    });
  });
});
