// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { unifiedLineDiff } from "./line-diff.js";

/**
 * The structural delta between two `.nt` artifacts (see {@link renderStructural}).
 *
 * INTENT: the comparison engine for the test-loop feedback surfaces — the post-run console delta
 * line, the failure delta against the last-green artifact, and approval-mode verification. Sameness
 * is byte equality of the artifact: the renderer is deterministic, so byte-identical means
 * behaviorally identical, and any difference is real change worth surfacing. Port of Java
 * `output.StructuralDelta`.
 */
export interface StructuralDelta {
  /** `true` iff the two artifacts are byte-identical — the scenario's structure did not change. */
  readonly unchanged: boolean;
  /**
   * Compact per-signature call-count changes, e.g. `+4 calls CurrencyConverter.toBaseCurrency`;
   * empty when {@link unchanged}.
   */
  readonly summary: string;
  /**
   * Full-document line diff in the conventional format: `-` removed, `+` added, one leading space
   * on unchanged context lines; empty when {@link unchanged}.
   */
  readonly diff: string;
}

/** Call lines are `- Class.method(params)` at any indent; fork markers and blanks are not calls. */
function callSignatures(document: string): readonly string[] {
  return document
    .split("\n")
    .map((line) => line.replace(/^\s+/, ""))
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
 * Compares a baseline artifact (last green or approved) against the current one.
 *
 * @param baseline the last-green or approved `.nt` document.
 * @param current the current run's `.nt` document.
 */
export function structuralDelta(baseline: string, current: string): StructuralDelta {
  const unchanged = baseline === current;
  return {
    unchanged,
    summary: unchanged ? "" : summarize(baseline, current),
    diff: unchanged ? "" : unifiedLineDiff(baseline, current),
  };
}
