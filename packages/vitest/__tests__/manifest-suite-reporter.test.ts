// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactIdentityOfMethod, type ScenarioManifestEntry } from "@narrativetrace/core-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { collectManifestEntries, ManifestSuiteReporter } from "../src/manifest-suite-reporter.js";
import { resetRunIdentityForTest, runIdentity } from "../src/run-identity-accumulator.js";

function entry(scenario: string): ScenarioManifestEntry {
  return {
    scenario,
    identity: artifactIdentityOfMethod("SvcTest", scenario),
    artifacts: new Map([["trace", `SvcTest/${scenario}.md`]]),
  };
}

function testTask(scenario: string) {
  return { type: "test", meta: { narrativeManifestEntry: entry(scenario) } };
}

describe("collectManifestEntries", () => {
  test("gathers meta from nested tasks across files in traversal order", () => {
    const files = [
      { type: "suite", tasks: [testTask("A"), testTask("B")] },
      { type: "suite", tasks: [{ type: "suite", tasks: [testTask("C")] }] },
    ];
    expect(collectManifestEntries(files).map((e) => e.scenario)).toStrictEqual(["A", "B", "C"]);
  });

  test("tasks without manifest-entry meta are skipped", () => {
    const files = [{ type: "suite", tasks: [{ type: "test" }, testTask("x")] }];
    expect(collectManifestEntries(files)).toHaveLength(1);
  });
});

describe("ManifestSuiteReporter.onFinished", () => {
  afterEach(() => {
    resetRunIdentityForTest();
  });

  function memReporter() {
    const writes: Record<string, string> = {};
    const reporter = new ManifestSuiteReporter({
      outputDir: "out",
      sink: { mkdir: () => {}, writeFile: (p, c) => (writes[p] = c) },
    });
    return { reporter, writes };
  }

  test("writes one manifest.json with every scenario, naming the run", () => {
    const { reporter, writes } = memReporter();
    const run = runIdentity();

    reporter.onFinished([{ type: "suite", tasks: [testTask("A"), testTask("B")] }]);

    const json = JSON.parse(writes["out/manifest.json"] as string);
    expect(json.scenarios.map((s: { scenario: string }) => s.scenario)).toStrictEqual(["A", "B"]);
    expect(json.run).toEqual({ id: run.id, name: run.name });
  });

  test("an empty suite writes nothing", () => {
    const { reporter, writes } = memReporter();
    reporter.onFinished([{ type: "suite", tasks: [{ type: "test" }] }]);
    expect(Object.keys(writes)).toHaveLength(0);
  });

  test("onInit establishes the run identity early", () => {
    resetRunIdentityForTest();
    const { reporter } = memReporter();
    reporter.onInit();
    expect(process.env["NARRATIVETRACE_RUN_ID"]).toBeDefined();
  });
});

/**
 * What a consumer actually gets from `reporters: ["default", new ManifestSuiteReporter()]` — no
 * sink, no `outputDir`. Every test above supplies both, so the production wiring (the real
 * filesystem, the env-configured directory) was never exercised (Java parity:
 * `ClaritySuiteReporter`'s own "with its shipped defaults" block).
 */
describe("ManifestSuiteReporter with its shipped defaults", () => {
  let temp: string;

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), "nt-manifest-"));
  });

  afterEach(() => {
    rmSync(temp, { recursive: true, force: true });
    resetRunIdentityForTest();
  });

  test("creates the output directory and writes manifest.json to disk", () => {
    // Nested on purpose: the default sink must create parents, not fail on the missing one.
    const dir = join(temp, "reports", "manifest");

    new ManifestSuiteReporter({ outputDir: dir }).onFinished([
      { type: "suite", tasks: [testTask("A")] },
    ]);

    const json = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    expect(json.scenarios.map((s: { scenario: string }) => s.scenario)).toStrictEqual(["A"]);
  });

  test("writes where NARRATIVETRACE_OUTPUT_DIR points when no outputDir is given", () => {
    const previous = process.env["NARRATIVETRACE_OUTPUT_DIR"];
    process.env["NARRATIVETRACE_OUTPUT_DIR"] = temp;
    try {
      new ManifestSuiteReporter().onFinished([{ type: "suite", tasks: [testTask("A")] }]);
      expect(readFileSync(join(temp, "manifest.json"), "utf-8")).toContain('"A"');
    } finally {
      if (previous === undefined) delete process.env["NARRATIVETRACE_OUTPUT_DIR"];
      else process.env["NARRATIVETRACE_OUTPUT_DIR"] = previous;
    }
  });

  test("falls back to narrativetrace-output when the environment names no directory", () => {
    const previous = process.env["NARRATIVETRACE_OUTPUT_DIR"];
    delete process.env["NARRATIVETRACE_OUTPUT_DIR"];
    try {
      // Asserted through a sink so the fallback cannot litter the repository being tested.
      const writes: Record<string, string> = {};
      const sink = { mkdir: () => {}, writeFile: (p: string, c: string) => (writes[p] = c) };
      new ManifestSuiteReporter({ sink }).onFinished([{ type: "suite", tasks: [testTask("A")] }]);
      expect(Object.keys(writes)).toContain("narrativetrace-output/manifest.json");
    } finally {
      if (previous !== undefined) process.env["NARRATIVETRACE_OUTPUT_DIR"] = previous;
    }
  });
});
