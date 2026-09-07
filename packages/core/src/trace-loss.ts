// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * What a captured trace is missing, and why.
 *
 * INTENT: both of the best-effort path's loss modes report through one type, so a reader is never
 * left guessing whether a short trace means "nothing happened" or "we dropped it". The synchronous
 * log stream is unaffected by either — it is the durable record, and a run that lost events here
 * still narrated them there.
 *
 * @remarks A non-zero loss makes the captured tree an incomplete view of the run, not a wrong one:
 * `droppedEvents` can leave a span with no exit, which surfaces as an `incomplete` outcome, so an
 * outcome — not only a branch — may be missing.
 */
export interface TraceLoss {
  /** Events the bounded capture buffer shed under load; monotonic since the buffer was created. */
  readonly droppedEvents: number;
  /**
   * Asynchronous scopes whose spans were refused whole because the adoption ceiling was full.
   *
   * @remarks Each one is an async subtree absent from the tree. Refusal is all-or-nothing by
   * design: adopting a prefix would strand children whose parent stayed out, and a parentless node
   * renders as a root, so the artifact would assert a call graph that never happened.
   */
  readonly refusedScopes: number;
  /** Spans lost to those refusals — the number a reader of the trace is missing. */
  readonly refusedSpans: number;
  /**
   * Spans dropped because the request that owned them had already ended — an asynchronous worker
   * that finished (or tried to hand its work over) after its origin was reset or collected.
   *
   * @remarks Deliberately not part of {@link anyTraceLoss}: a discard happens after the request
   * that owned the work ended, so no narrative anyone renders is missing anything it could have
   * contained — this counts a background straggler, not an incomplete trace.
   */
  readonly discardedSpans: number;
}

/** The shared "nothing was lost" reading. */
export const NO_TRACE_LOSS: TraceLoss = Object.freeze({
  droppedEvents: 0,
  refusedScopes: 0,
  refusedSpans: 0,
  discardedSpans: 0,
});

/**
 * Builds a {@link TraceLoss} reading.
 *
 * @param droppedEvents events the capture buffer shed.
 * @param refusedScopes scopes whose hand-over the adoption ceiling refused whole.
 * @param refusedSpans spans lost to those refusals.
 * @param discardedSpans spans discarded because their request had already ended; defaults to `0`
 * so every existing call site keeps meaning what it did before this field existed.
 * @throws RangeError if any count is negative — a loss counter only ever grows.
 * @example
 * ```ts
 * traceLoss(0, 0, 0) === NO_TRACE_LOSS's shape; anyTraceLoss(traceLoss(0, 1, 12)) === true
 * ```
 */
export function traceLoss(
  droppedEvents: number,
  refusedScopes: number,
  refusedSpans: number,
  discardedSpans = 0,
): TraceLoss {
  if (droppedEvents < 0 || refusedScopes < 0 || refusedSpans < 0 || discardedSpans < 0) {
    throw new RangeError("Loss counts must not be negative");
  }
  return Object.freeze({ droppedEvents, refusedScopes, refusedSpans, discardedSpans });
}

/**
 * True when something was lost, i.e. the captured trace is an incomplete view of the run.
 *
 * @remarks `refusedSpans` is deliberately not consulted: a refusal always counts a scope, and a
 * scope that handed over an empty batch is not a loss.
 */
export function anyTraceLoss(loss: TraceLoss): boolean {
  return loss.droppedEvents > 0 || loss.refusedScopes > 0;
}
