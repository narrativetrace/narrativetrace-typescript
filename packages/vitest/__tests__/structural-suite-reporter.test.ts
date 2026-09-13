// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioDelta } from "@narrativetrace/core-node";
import { describe, expect, test, vi } from "vitest";
import {
  collectStructuralDeltas,
  StructuralSuiteReporter,
} from "../src/structural-suite-reporter.js";

function delta(scenario: string, kind: ScenarioDelta["kind"]): ScenarioDelta {
  return { scenario, kind, summary: kind === "changed" ? "+1 call X.y" : "", diff: "" };
}

function testTask(scenario: string, kind: ScenarioDelta["kind"]) {
  return { type: "test", meta: { narrativeStructuralDelta: delta(scenario, kind) } };
}

describe("collectStructuralDeltas", () => {
  test("gathers meta from nested tasks across files in traversal order", () => {
    const files = [
      { type: "suite", tasks: [testTask("A", "unchanged"), testTask("B", "new")] },
      { type: "suite", tasks: [{ type: "suite", tasks: [testTask("C", "changed")] }] },
    ];
    expect(collectStructuralDeltas(files).map((d) => d.scenario)).toStrictEqual(["A", "B", "C"]);
  });

  test("tasks without structural-delta meta are skipped", () => {
    const files = [{ type: "suite", tasks: [{ type: "test" }, testTask("x", "unchanged")] }];
    expect(collectStructuralDeltas(files)).toHaveLength(1);
  });
});

describe("StructuralSuiteReporter.onFinished", () => {
  test("prints the 'Since last green' line once when at least one test wrote a delta", () => {
    const logs: string[] = [];
    const reporter = new StructuralSuiteReporter({ log: (m) => logs.push(m) });
    reporter.onFinished([
      { type: "suite", tasks: [testTask("A", "unchanged"), testTask("B", "changed")] },
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Since last green:");
    expect(logs[0]).toContain('"B" (+1 call X.y)');
  });

  test("an empty suite (no structural artifacts) prints nothing", () => {
    const logs: string[] = [];
    new StructuralSuiteReporter({ log: (m) => logs.push(m) }).onFinished([
      { type: "suite", tasks: [{ type: "test" }] },
    ]);
    expect(logs).toHaveLength(0);
  });

  test("uses the shipped default logger (process.stdout.write) when none is injected", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    new StructuralSuiteReporter().onFinished([{ type: "suite", tasks: [testTask("A", "new")] }]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Since last green:"));
    spy.mockRestore();
  });
});
