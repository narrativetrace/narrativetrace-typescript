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

  it("a baseline written before span ids existed still matches the same flow with ids", () => {
    const old = "scenario: X\n\n- Svc.run()\n  - Ledger.record()\n";
    const now = "scenario: X\n\n#1 - Svc.run()\n  #1.1 - Ledger.record()\n";
    expect(structuralDelta(old, now).unchanged).toBe(true);
  });

  it("a CRLF checkout of the baseline is not a structural change", () => {
    const crlf = "scenario: X\r\n\r\n#1 - Svc.run()\r\n";
    expect(structuralDelta(crlf, "scenario: X\n\n#1 - Svc.run()\n").unchanged).toBe(true);
  });

  it("a missing final newline is not a structural change", () => {
    expect(structuralDelta("#1 - Svc.run()", "#1 - Svc.run()\n").unchanged).toBe(true);
  });

  it("an extra blank line IS a change — only terminators and the final newline are set aside", () => {
    expect(structuralDelta("#1 - Svc.run()\n", "\n#1 - Svc.run()\n").unchanged).toBe(false);
  });

  it("an inserted call cites the id each shifted sibling had before (was #id)", () => {
    const baseline = "#1 - Svc.run()\n  #1.1 - A.a()\n  #1.2 - B.b()\n";
    const current = "#1 - Svc.run()\n  #1.1 - New.call()\n  #1.2 - A.a()\n  #1.3 - B.b()\n";
    expect(structuralDelta(baseline, current).diff).toBe(
      " #1 - Svc.run()\n" +
        "+  #1.1 - New.call()\n" +
        "   #1.2 - A.a()  (was #1.1)\n" +
        "   #1.3 - B.b()  (was #1.2)\n",
    );
  });

  it("an id-free baseline has no id to cite, so its context lines print as the current run does", () => {
    const baseline = "- Svc.run()\n  - A.a()\n";
    const current = "#1 - Svc.run()\n  #1.1 - New.call()\n  #1.2 - A.a()\n";
    expect(structuralDelta(baseline, current).diff).toBe(
      " #1 - Svc.run()\n+  #1.1 - New.call()\n   #1.2 - A.a()\n",
    );
  });

  it("a removed line prints as the baseline wrote it, an added one as the current run does", () => {
    const delta = structuralDelta("#1 - Old.call()\n", "#1 - New.call()\n");
    expect(delta.diff).toBe("-#1 - Old.call()\n+#1 - New.call()\n");
  });

  it("the summary counts calls whatever ids they carry", () => {
    const delta = structuralDelta("#1 - Svc.run()\n", "#1 - Svc.run()\n  #1.1 - Ledger.record()\n");
    expect(delta.summary).toBe("+1 call Ledger.record");
  });
});

describe("structuralDelta(...).onlyOmits — the question to ask of an incomplete run", () => {
  it("an omission that shifts later ids is still only an omission", () => {
    const baseline = "#1 - Svc.run()\n  #1.1 - A.a()\n  #1.2 - B.b()\n";
    const current = "#1 - Svc.run()\n  #1.1 - B.b()\n";
    expect(structuralDelta(baseline, current).onlyOmits).toBe(true);
  });

  it("an added call is not an omission", () => {
    const baseline = "#1 - Svc.run()\n";
    const current = "#1 - Svc.run()\n  #1.1 - B.b()\n";
    expect(structuralDelta(baseline, current).onlyOmits).toBe(false);
  });
});

describe("structuralDelta — its inputs", () => {
  it.each([
    [undefined, "#1 - A.b()\n"],
    ["#1 - A.b()\n", undefined],
  ])("refuses a missing document (%j, %j): an absent baseline is a new scenario, not a delta", (baseline, current) => {
    expect(() =>
      structuralDelta(baseline as unknown as string, current as unknown as string),
    ).toThrow(
      new TypeError("structuralDelta compares two documents; an absent baseline is not one"),
    );
  });

  it("counts a call line that lost its parentheses by its whole name", () => {
    expect(structuralDelta("- A.b\n", "").summary).toBe("-1 call A.b");
  });
});
