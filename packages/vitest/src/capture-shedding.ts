// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * What one test's capture window lost to a full buffer, and the number to raise to.
 *
 * INTENT: a shed event is a hole in the narrative, and the buffer sheds *silently* by design — at
 * its cap it overwrites the oldest unread event rather than blocking the traced call. Whoever sized
 * the buffer is therefore the only party that can explain the hole, which is why this lives beside
 * the fixture that passes the capacity rather than in the runtime that drops the events.
 */
export interface CaptureShedding {
  /** Events the capture buffer dropped during the test; `0` for a clean capture. */
  readonly shedEvents: number;
  /** The capacity that proved too small, so the notice can name what to change. */
  readonly capacity: number;
  /**
   * Asynchronous scopes the adoption ceiling refused whole; `0` when nothing was refused.
   *
   * @remarks A different hole from a shed event, and it needs its own line: the buffer loses
   * individual events, whereas a refusal loses a whole async subtree, and the remedy is not a
   * bigger buffer.
   */
  readonly refusedScopes?: number;
  /** Spans lost to those refusals — what the reader is missing, in spans. */
  readonly refusedSpans?: number;
}

/**
 * Smallest doubling of the configured capacity that would have held the whole window.
 *
 * @remarks Doubling rather than `capacity + shedEvents` exactly: the shed count is a floor, not a
 * measurement of the window (events that were shed *and* drained are counted once, and a longer
 * test would have shed more), so the advice rounds up rather than proposing a number that only
 * just fits the run that happened to be observed.
 */
function suggestedCapacity(shedding: CaptureShedding): number {
  const needed = shedding.capacity + shedding.shedEvents;
  let suggestion = shedding.capacity;
  while (suggestion < needed) suggestion *= 2;
  return suggestion;
}

/**
 * One line naming the loss and its remedy, or `undefined` when nothing was shed.
 *
 * INTENT: the single wording used by every channel — console narrative and artifact footers alike —
 * so a developer who sees it in one place recognises it in the others.
 *
 * @param shedding what the capture window lost; `undefined` is treated as a clean capture.
 * @returns the notice, or `undefined` when there is nothing to announce (never an empty string —
 * callers branch on presence, and `""` would print a blank line).
 * @example
 * ```ts
 * shedNotice({ shedEvents: 40, capacity: 8192 });
 * // "NarrativeTrace dropped 40 events: the capture buffer (8192) overflowed, so this narrative
 * //  is incomplete. Raise it with createNarrativeTest({ bufferCapacity: 16384 })."
 * shedNotice({ shedEvents: 0, capacity: 8192 }); // undefined
 * ```
 */
export function shedNotice(shedding: CaptureShedding | undefined): string | undefined {
  if (shedding === undefined || shedding.shedEvents <= 0) return undefined;
  const plural = shedding.shedEvents === 1 ? "event" : "events";
  return (
    `NarrativeTrace dropped ${shedding.shedEvents} ${plural}: the capture buffer ` +
    `(${shedding.capacity}) overflowed, so this narrative is incomplete. Raise it with ` +
    `createNarrativeTest({ bufferCapacity: ${suggestedCapacity(shedding)} }).`
  );
}

/**
 * One line naming the async subtrees the adoption ceiling refused, or `undefined` when none were.
 *
 * INTENT: the second way a capture can be incomplete, and the one no buffer size fixes. A refused
 * hand-over is all-or-nothing — the whole subtree stayed out rather than a prefix of it landing and
 * stranding children — so the honest report is a count of subtrees, not of events.
 *
 * @param shedding what the capture window lost; `undefined`, or zero refusals, is treated as clean.
 * @returns the notice, or `undefined` when there is nothing to announce (never an empty string —
 * callers branch on presence, and `""` would print a blank line).
 * @example
 * ```ts
 * refusalNotice({ shedEvents: 0, capacity: 8192, refusedScopes: 2, refusedSpans: 41 });
 * // "NarrativeTrace refused 2 async scopes (41 spans): the adoption ceiling was full, so those
 * //  subtrees are absent from this narrative."
 * refusalNotice({ shedEvents: 0, capacity: 8192 }); // undefined
 * ```
 */
export function refusalNotice(shedding: CaptureShedding | undefined): string | undefined {
  if (shedding === undefined) return undefined;
  const scopes = shedding.refusedScopes ?? 0;
  if (scopes <= 0) return undefined;
  const plural = scopes === 1 ? "async scope" : "async subtrees";
  const spans = shedding.refusedSpans ?? 0;
  return (
    `NarrativeTrace refused ${scopes} ${plural} (${spans} spans): the adoption ceiling was ` +
    `full, so ${scopes === 1 ? "that subtree is" : "those subtrees are"} absent from this narrative.`
  );
}
