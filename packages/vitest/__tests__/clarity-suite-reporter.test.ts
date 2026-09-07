// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScenarioResult } from "@narrativetrace/clarity";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ClaritySuiteReporter, collectClarityEntries } from "../src/clarity-suite-reporter.js";

function entry(scenario: string, overall: number): ScenarioResult {
  return {
    scenario,
    result: {
      overall,
      method: overall,
      class: overall,
      parameter: overall,
      structural: overall,
      cohesion: overall,
      issues: [],
    },
  };
}

function testTask(scenario: string, overall: number) {
  return { type: "test", meta: { narrativeClarity: entry(scenario, overall) } };
}

function memReporter() {
  const writes: Record<string, string> = {};
  const logs: string[] = [];
  const reporter = new ClaritySuiteReporter({
    outputDir: "out",
    sink: { mkdir: () => {}, writeFile: (p, c) => (writes[p] = c) },
    log: (m) => logs.push(m),
  });
  return { reporter, writes, logs };
}

describe("collectClarityEntries", () => {
  test("gathers meta from nested tasks across files in traversal order", () => {
    const files = [
      { type: "suite", tasks: [testTask("File1 > a", 0.5), testTask("File1 > b", 0.9)] },
      { type: "suite", tasks: [{ type: "suite", tasks: [testTask("File2 > c", 0.3)] }] },
    ];
    expect(collectClarityEntries(files).map((e) => e.scenario)).toStrictEqual([
      "File1 > a",
      "File1 > b",
      "File2 > c",
    ]);
  });

  test("tasks without clarity meta are skipped", () => {
    const files = [{ type: "suite", tasks: [{ type: "test" }, testTask("x", 0.4)] }];
    expect(collectClarityEntries(files)).toHaveLength(1);
  });
});

describe("ClaritySuiteReporter.onFinished", () => {
  test("writes one results.json + report.md and logs the footer once", () => {
    const { reporter, writes, logs } = memReporter();
    reporter.onFinished([
      { type: "suite", tasks: [testTask("A", 0.9), testTask("A", 0.5)] },
      { type: "suite", tasks: [testTask("B", 0.2)] },
    ]);
    const json = JSON.parse(writes["out/clarity-results.json"] as string);
    expect(json.scenarios.map((s: { name: string }) => s.name)).toStrictEqual(["A", "A", "B"]);
    expect(writes["out/clarity-report.md"]).toContain("# Clarity Suite Report");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("3 scenarios recorded");
  });

  test("empty suite writes nothing and logs nothing", () => {
    const { reporter, writes, logs } = memReporter();
    reporter.onFinished([{ type: "suite", tasks: [{ type: "test" }] }]);
    expect(Object.keys(writes)).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });
});

/**
 * What a consumer actually gets from `reporters: ["default", new ClaritySuiteReporter()]` — no
 * sink, no logger, no `outputDir`. Every test above supplies all three, so the production wiring
 * (real filesystem, real stdout, the env-configured directory) was never exercised.
 */
describe("ClaritySuiteReporter with its shipped defaults", () => {
  const SUITE = [{ type: "suite", tasks: [testTask("A", 0.9), testTask("B", 0.2)] }];
  let temp: string;

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), "nt-clarity-"));
    delete process.env["NARRATIVETRACE_OUTPUT_DIR"];
  });

  afterEach(() => {
    rmSync(temp, { recursive: true, force: true });
    delete process.env["NARRATIVETRACE_OUTPUT_DIR"];
    vi.restoreAllMocks();
  });

  test("creates the output directory and writes both artifacts to disk", () => {
    // Nested on purpose: the default sink must create parents, not fail on the missing one.
    const dir = join(temp, "reports", "clarity");

    new ClaritySuiteReporter({ outputDir: dir, log: () => {} }).onFinished(SUITE);

    const json = JSON.parse(readFileSync(join(dir, "clarity-results.json"), "utf-8"));
    expect(json.scenarios.map((s: { name: string }) => s.name)).toStrictEqual(["A", "B"]);
    expect(readFileSync(join(dir, "clarity-report.md"), "utf-8")).toContain(
      "# Clarity Suite Report",
    );
  });

  test("prints the footer to stdout as one newline-terminated line", () => {
    const out = captureStdout();

    new ClaritySuiteReporter({ outputDir: temp }).onFinished(SUITE);

    expect(out.text()).toContain("2 scenarios recorded");
    expect(out.text().endsWith("\n")).toBe(true);
  });

  test("an empty suite prints nothing at all to stdout", () => {
    const out = captureStdout();

    new ClaritySuiteReporter({ outputDir: temp }).onFinished([{ type: "suite", tasks: [] }]);

    expect(out.text()).toBe("");
  });

  test("writes where NARRATIVETRACE_OUTPUT_DIR points when no outputDir is given", () => {
    process.env["NARRATIVETRACE_OUTPUT_DIR"] = temp;

    new ClaritySuiteReporter({ log: () => {} }).onFinished(SUITE);

    expect(readFileSync(join(temp, "clarity-results.json"), "utf-8")).toContain('"A"');
  });

  test("falls back to narrativetrace-output when the environment names no directory", () => {
    // Asserted through a sink so the fallback cannot litter the repository being tested.
    const writes: Record<string, string> = {};
    const sink = { mkdir: () => {}, writeFile: (p: string, c: string) => (writes[p] = c) };

    new ClaritySuiteReporter({ sink, log: () => {} }).onFinished(SUITE);

    expect(Object.keys(writes)).toContain("narrativetrace-output/clarity-results.json");
  });
});

function captureStdout() {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  return { text: () => chunks.join("") };
}
