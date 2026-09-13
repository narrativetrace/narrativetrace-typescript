// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { scenarioDelta } from "../src/scenario-delta.js";

describe("scenarioDelta", () => {
  it("classifies a scenario with no baseline as new", () => {
    const delta = scenarioDelta("My scenario", undefined, "- Svc.run()\n");
    expect(delta.kind).toBe("new");
    expect(delta.summary).toBe("");
    expect(delta.diff).toBe("");
  });

  it("classifies a byte-identical scenario as unchanged", () => {
    const doc = "- Svc.run()\n";
    const delta = scenarioDelta("My scenario", doc, doc);
    expect(delta.kind).toBe("unchanged");
  });

  it("classifies a differing scenario as changed, carrying the summary and diff", () => {
    const delta = scenarioDelta(
      "My scenario",
      "- Svc.run()\n",
      "- Svc.run()\n  - Ledger.record()\n",
    );
    expect(delta.kind).toBe("changed");
    expect(delta.summary).toBe("+1 call Ledger.record");
    expect(delta.diff.length).toBeGreaterThan(0);
  });

  it("carries the scenario name through unchanged", () => {
    expect(scenarioDelta("Weekend trip", "x", "y").scenario).toBe("Weekend trip");
  });
});
