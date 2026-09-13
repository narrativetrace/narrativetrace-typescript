// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { evaluateApprovalTrace } from "../src/approval-trace.js";

/** Mirrors the decision logic of Java's `NarrativeApprovalTest` / `LossyApprovalTest`. */
describe("evaluateApprovalTrace", () => {
  it("reports no-approved-trace with the current render as the would-be received trace", () => {
    const outcome = evaluateApprovalTrace(undefined, "- Svc.run()\n");
    expect(outcome.kind).toBe("no-approved-trace");
    if (outcome.kind === "no-approved-trace") expect(outcome.received).toBe("- Svc.run()\n");
  });

  it("matches a byte-identical approved trace", () => {
    const doc = "- Svc.run()\n";
    expect(evaluateApprovalTrace(doc, doc).kind).toBe("match");
  });

  it("reports changed with a summary and diff, and the received document to write", () => {
    const outcome = evaluateApprovalTrace("- Svc.run()\n", "- Svc.run()\n  - Ledger.record()\n");
    expect(outcome.kind).toBe("changed");
    if (outcome.kind === "changed") {
      expect(outcome.summary).toBe("+1 call Ledger.record");
      expect(outcome.received).toBe("- Svc.run()\n  - Ledger.record()\n");
    }
  });

  it("tolerates a lossy run that is a subsequence of the approved trace", () => {
    const approved = "- Svc.run()\n  - A.a()\n  - B.b()\n";
    const current = "- Svc.run()\n  - A.a()\n"; // B.b() missing — a dropped event, not a real change
    const outcome = evaluateApprovalTrace(approved, current, "1 event dropped");
    expect(outcome.kind).toBe("lossy-match");
    if (outcome.kind === "lossy-match") expect(outcome.note).toContain("1 event dropped");
  });

  it("still fails a lossy run that adds, renames, or reorders a call", () => {
    const approved = "- Svc.run()\n  - A.a()\n";
    const current = "- Svc.run()\n  - C.c()\n"; // not a subsequence: renamed, not merely shortened
    const outcome = evaluateApprovalTrace(approved, current, "1 event dropped");
    expect(outcome.kind).toBe("lossy-changed");
    if (outcome.kind === "lossy-changed") expect(outcome.received).toBe(current);
  });
});
