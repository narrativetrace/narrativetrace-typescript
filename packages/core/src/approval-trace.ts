// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { isSubsequence, unifiedLineDiff } from "./line-diff.js";
import { structuralDelta } from "./structural-delta.js";

/**
 * Approval traces (ADR-002 applied to the value-free `.nt` structural artifact — the
 * approval-testing idea, applied to traces): a committed **approved trace** (`.approved.nt`) is the
 * behavioral contract, and a run whose structure differs produces a **received trace**
 * (`.received.nt`) for review instead of silently passing.
 *
 * INTENT: pure decision logic only — no filesystem here, so this stays usable from any host (a
 * Vitest fixture, a future test-framework integration, a standalone script). The caller reads the
 * approved trace (if any) and the current run's `.nt` document, calls {@link evaluateApprovalTrace},
 * and acts on the result: write the received trace, throw to fail the test, or do nothing. Port of
 * Java `output.NarrativeApproval`.
 */
export type ApprovalTraceOutcome =
  | { readonly kind: "no-approved-trace"; readonly received: string }
  | { readonly kind: "match" }
  | {
      readonly kind: "changed";
      readonly summary: string;
      readonly diff: string;
      readonly received: string;
    }
  | { readonly kind: "lossy-match"; readonly note: string }
  | { readonly kind: "lossy-changed"; readonly diff: string; readonly received: string };

/**
 * Evaluates the current run's structure against its approved trace.
 *
 * @param approvedTrace the committed `.approved.nt` document, or `undefined` when none exists yet.
 * @param current the current run's rendered `.nt` document.
 * @param lossNote when the run was incomplete (the best-effort capture path dropped events or
 * refused an async scope), a human-readable description of what was lost — switches the comparison
 * to subsequence containment (absences tolerated and named; anything added, renamed or reordered
 * still fails) instead of byte equality, since a lossy run's missing branches are evidence about the
 * machine, not about the code.
 */
export function evaluateApprovalTrace(
  approvedTrace: string | undefined,
  current: string,
  lossNote?: string,
): ApprovalTraceOutcome {
  if (approvedTrace === undefined) {
    return { kind: "no-approved-trace", received: current };
  }
  if (lossNote !== undefined) {
    return evaluateLossy(approvedTrace, current, lossNote);
  }
  const delta = structuralDelta(approvedTrace, current);
  if (delta.unchanged) {
    return { kind: "match" };
  }
  return { kind: "changed", summary: delta.summary, diff: delta.diff, received: current };
}

/** Subsequence containment: the run may be short, but everything in it must be in the approved trace. */
function evaluateLossy(
  approvedTrace: string,
  current: string,
  lossNote: string,
): ApprovalTraceOutcome {
  if (isSubsequence(approvedTrace, current)) {
    const note = `consistent with approved trace, but this run was incomplete (${lossNote})`;
    return { kind: "lossy-match", note };
  }
  return {
    kind: "lossy-changed",
    diff: unifiedLineDiff(approvedTrace, current),
    received: current,
  };
}
