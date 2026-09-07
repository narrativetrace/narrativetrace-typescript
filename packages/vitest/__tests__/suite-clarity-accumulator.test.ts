// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioResult } from "@narrativetrace/clarity";
import { afterEach, describe, expect, test } from "vitest";
import {
  clarityScenarioCount,
  drainClarityScenarios,
  recordClarityScenario,
  suiteClarityFooter,
  writeSuiteClarityArtifacts,
} from "../src/suite-clarity-accumulator.js";

function entry(
  scenario: string,
  overall: number,
  issues: ScenarioResult["result"]["issues"] = [],
): ScenarioResult {
  return {
    scenario,
    result: {
      overall,
      method: overall,
      class: overall,
      parameter: overall,
      structural: overall,
      cohesion: overall,
      issues,
    },
  };
}

function memFs() {
  const writes: Record<string, string> = {};
  return {
    writes,
    mkdir: () => {},
    writeFile: (path: string, content: string) => {
      writes[path] = content;
    },
  };
}

afterEach(() => {
  drainClarityScenarios();
});

describe("suite clarity registry", () => {
  test("records and drains scenarios in insertion order, retaining duplicates", () => {
    recordClarityScenario(entry("A", 0.5));
    recordClarityScenario(entry("A", 0.6));
    recordClarityScenario(entry("B", 0.9));
    expect(clarityScenarioCount()).toBe(3);
    const drained = drainClarityScenarios();
    expect(drained.map((e) => e.scenario)).toStrictEqual(["A", "A", "B"]);
    // Draining empties the registry.
    expect(clarityScenarioCount()).toBe(0);
  });
});

describe("writeSuiteClarityArtifacts", () => {
  test("empty suite writes nothing", () => {
    const fs = memFs();
    const outcome = writeSuiteClarityArtifacts([], "out", fs);
    expect(outcome.written).toBe(false);
    expect(Object.keys(fs.writes)).toHaveLength(0);
  });

  test("writes one results.json with N entries and one report.md", () => {
    const fs = memFs();
    const entries = [entry("A", 0.9), entry("A", 0.5), entry("B", 0.3)];
    const outcome = writeSuiteClarityArtifacts(entries, "out", fs);
    expect(outcome.written).toBe(true);
    const json = JSON.parse(fs.writes["out/clarity-results.json"] as string);
    // All three entries retained, in insertion order (duplicates kept).
    expect(json.scenarios.map((s: { name: string }) => s.name)).toStrictEqual(["A", "A", "B"]);
    expect(fs.writes["out/clarity-report.md"]).toContain("# Clarity Suite Report");
  });
});

describe("suiteClarityFooter", () => {
  test("empty suite has no footer", () => {
    expect(suiteClarityFooter([], "out")).toBeUndefined();
  });

  test("footer reports the high/moderate/low split once", () => {
    const footer = suiteClarityFooter([entry("A", 0.9), entry("B", 0.5), entry("C", 0.2)], "out");
    expect(footer).toContain("3 scenarios recorded");
    // 0.9 high, 0.5 moderate, 0.2 low → 33% each.
    expect(footer).toContain("33% high | 33% moderate | 33% low");
  });
});
