// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioDelta } from "@narrativetrace/core-node";
import { afterEach, describe, expect, test } from "vitest";
import {
  drainStructuralDeltas,
  recordStructuralDelta,
  structuralDeltaCount,
  structuralDeltaFooterLine,
} from "../src/structural-suite-accumulator.js";

function delta(scenario: string, kind: ScenarioDelta["kind"] = "unchanged"): ScenarioDelta {
  return { scenario, kind, summary: "", diff: "" };
}

afterEach(() => {
  drainStructuralDeltas();
});

describe("structural delta registry", () => {
  test("records and drains deltas in insertion order, retaining duplicates", () => {
    recordStructuralDelta(delta("A"));
    recordStructuralDelta(delta("A"));
    recordStructuralDelta(delta("B"));
    expect(structuralDeltaCount()).toBe(3);
    const drained = drainStructuralDeltas();
    expect(drained.map((d) => d.scenario)).toStrictEqual(["A", "A", "B"]);
    expect(structuralDeltaCount()).toBe(0);
  });
});

describe("structuralDeltaFooterLine", () => {
  test("is undefined when no test wrote a structural artifact", () => {
    expect(structuralDeltaFooterLine([])).toBeUndefined();
  });

  test("prefixes the delta line with 'Since last green:'", () => {
    const line = structuralDeltaFooterLine([delta("A"), delta("B")]);
    expect(line).toBe("  Since last green: 2 scenarios unchanged");
  });
});
