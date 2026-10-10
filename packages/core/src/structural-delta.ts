// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { CitableSpanId } from "./citable-span-id.js";
import { isSubsequence, unifiedLineDiff } from "./line-diff.js";

/**
 * The structural delta between two `.nt` artifacts (see {@link renderStructural}).
 *
 * INTENT: the comparison engine for the test-loop feedback surfaces — the post-run console delta
 * line, the failure delta against the last-green artifact, and approval-mode verification. Sameness
 * is equality of the artifact's LINES with span ids set aside: the renderer is deterministic, so
 * the same lines mean the same behaviour, and any difference is real change worth surfacing. A
 * baseline written before span ids existed, or checked out with CRLF line endings, or missing its
 * final newline, still compares. Port of Java `output.StructuralDelta`.
 */
export interface StructuralDelta {
  /**
   * `true` iff the two artifacts have the same lines once span ids, line terminators and a final
   * newline are set aside — the scenario's structure did not change.
   */
  readonly unchanged: boolean;
  /**
   * `true` when the current document differs from the baseline only by omission — every one of its
   * lines appears in the baseline, in order, span ids set aside. The question to ask of a run known
   * to be incomplete: an omission shifts the ids of later siblings, which is not a change.
   */
  readonly onlyOmits: boolean;
  /**
   * Compact per-signature call-count changes, e.g. `+4 calls CurrencyConverter.toBaseCurrency`;
   * empty when {@link unchanged}.
   */
  readonly summary: string;
  /**
   * Full-document line diff in the conventional format: `-` removed, `+` added, one leading space
   * on unchanged context lines; empty when {@link unchanged}. Lines are matched with span ids set
   * aside; a context line prints as the current run wrote it, citing the baseline's id when an
   * insertion or removal earlier in the list shifted it — `#1.3 - A.b()  (was #1.2)`.
   */
  readonly diff: string;
}

/** Call lines are `- Class.method(params)` at any indent; fork markers and blanks are not calls. */
function callSignatures(document: string): readonly string[] {
  return document
    .split(/\r\n|\r|\n/)
    .map((line) => CitableSpanId.strip(line).replace(/^\s+/, ""))
    .filter((line) => line.startsWith("- "))
    .map(signatureOf);
}

function signatureOf(callLine: string): string {
  const open = callLine.indexOf("(");
  return open < 0 ? callLine.slice(2) : callLine.slice(2, open);
}

function countChanges(baseline: string, current: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const signature of callSignatures(current))
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  for (const signature of callSignatures(baseline))
    counts.set(signature, (counts.get(signature) ?? 0) - 1);
  for (const [signature, count] of counts) if (count === 0) counts.delete(signature);
  return counts;
}

function formatChange(signature: string, count: number): string {
  const magnitude = Math.abs(count);
  const noun = magnitude === 1 ? " call " : " calls ";
  return `${count > 0 ? "+" : "-"}${magnitude}${noun}${signature}`;
}

function summarize(baseline: string, current: string): string {
  const changes = countChanges(baseline, current);
  if (changes.size === 0) return "structure changed";
  return [...changes.entries()]
    .map(([signature, count]) => formatChange(signature, count))
    .join(", ");
}

/**
 * The document's lines with every span id removed, joined by LF — the form sameness is decided on.
 * Ids are derived from position and carry no behaviour of their own; line terminators (LF, CRLF,
 * CR) and a final newline are encoding, not structure.
 */
function withoutIds(document: string): string {
  const lines = document.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.map(CitableSpanId.strip).join("\n");
}

/**
 * A matched line as the current document prints it, citing the baseline's id when it differs. A
 * baseline written before span ids existed has none to cite.
 */
function contextLine(was: string, now: string): string {
  const wasId = CitableSpanId.of(was);
  return wasId === undefined || wasId === CitableSpanId.of(now) ? now : `${now}  (was ${wasId})`;
}

/**
 * Compares a baseline artifact (last green or approved) against the current one.
 *
 * @param baseline the last-green or approved `.nt` document.
 * @param current the current run's `.nt` document.
 * @throws TypeError when either document is not a string — an absent baseline is a caller-level
 * state (a new scenario), not a delta.
 */
export function structuralDelta(baseline: string, current: string): StructuralDelta {
  if (typeof baseline !== "string" || typeof current !== "string") {
    throw new TypeError("structuralDelta compares two documents; an absent baseline is not one");
  }
  const unchanged = withoutIds(baseline) === withoutIds(current);
  return {
    unchanged,
    onlyOmits: isSubsequence(withoutIds(baseline), withoutIds(current)),
    summary: unchanged ? "" : summarize(baseline, current),
    diff: unchanged ? "" : unifiedLineDiff(baseline, current, CitableSpanId.strip, contextLine),
  };
}
