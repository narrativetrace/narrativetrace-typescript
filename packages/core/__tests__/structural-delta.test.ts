// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { structuralDelta } from "../src/structural-delta.js";

/** Mirrors Java's `StructuralDeltaTest`. */
describe("structuralDelta", () => {
  it("reports unchanged for byte-identical documents", () => {
    const doc = "scenario: X\n\n- Svc.run()\n";
    const delta = structuralDelta(doc, doc);
    expect(delta.unchanged).toBe(true);
    expect(delta.summary).toBe("");
    expect(delta.diff).toBe("");
  });

  it("summarizes an added call as +N calls Sig", () => {
    const baseline = "- Svc.run()\n";
    const current = "- Svc.run()\n  - Ledger.record()\n";
    const delta = structuralDelta(baseline, current);
    expect(delta.unchanged).toBe(false);
    expect(delta.summary).toBe("+1 call Ledger.record");
  });

  it("uses the singular noun for a single removed call", () => {
    const baseline = "- Svc.run()\n  - Ledger.record()\n";
    const current = "- Svc.run()\n";
    const delta = structuralDelta(baseline, current);
    expect(delta.summary).toBe("-1 call Ledger.record");
  });

  it("uses the plural noun for multiple call-count changes", () => {
    const baseline = "- Svc.run()\n";
    const current = "- Svc.run()\n  - Ledger.record()\n  - Ledger.record()\n";
    const delta = structuralDelta(baseline, current);
    expect(delta.summary).toBe("+2 calls Ledger.record");
  });

  it("falls back to 'structure changed' when the call multiset is identical but shape differs", () => {
    const baseline = "- Svc.run()\n  ~ fork [2]\n    - A.a()\n    - B.b()\n";
    const current = "- Svc.run()\n  - A.a()\n  - B.b()\n";
    const delta = structuralDelta(baseline, current);
    expect(delta.unchanged).toBe(false);
    expect(delta.summary).toBe("structure changed");
  });

  it("renders a full diff with deletions before their replacement insertions", () => {
    const baseline = "- Svc.run()\n  - Old.call()\n";
    const current = "- Svc.run()\n  - New.call()\n";
    const delta = structuralDelta(baseline, current);
    expect(delta.diff).toBe(" - Svc.run()\n-  - Old.call()\n+  - New.call()\n");
  });

  it("lists additions before removals in the summary when both occur", () => {
    const baseline = "- Svc.run()\n  - Removed.call()\n";
    const current = "- Svc.run()\n  - Added.call()\n";
    const delta = structuralDelta(baseline, current);
    expect(delta.summary).toBe("+1 call Added.call, -1 call Removed.call");
  });

  it("does not count fork markers as calls", () => {
    const baseline = "- Svc.run()\n";
    const current = "- Svc.run()\n  ~ fork [2]\n    - A.a()\n    - B.b()\n";
    const delta = structuralDelta(baseline, current);
    expect(delta.summary).toBe("+1 call A.a, +1 call B.b");
  });
});
