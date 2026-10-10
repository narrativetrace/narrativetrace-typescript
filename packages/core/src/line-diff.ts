// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Longest-common-subsequence line diff in the conventional format: `-` removed, `+` added, one
 * leading space on unchanged context lines.
 *
 * INTENT: the rendering half of {@link structuralDelta} — kept free of any `.nt` format knowledge
 * so the delta module owns what a change *means* and this module owns how a change *reads*. Inputs
 * are whole documents; ties between a deletion and an insertion resolve to the deletion, so removed
 * lines always precede their replacements. Port of Java `output.LineDiff`.
 */

/**
 * A document's lines, without their terminators: LF, CRLF and a lone CR all end a line (Java
 * `String.lines()`), and a final terminator opens no empty last line. Line endings are a checkout's
 * encoding (`core.autocrlf`), never structure.
 */
function splitLines(document: string): readonly string[] {
  if (document.length === 0) return [];
  const lines = document.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * True when every line of `current` appears in `baseline`, in order — i.e. `current` differs from
 * `baseline` only by omission.
 *
 * INTENT: the question to ask of a run known to be incomplete. Equality would fail on the absences
 * the best-effort path caused; containment tolerates exactly those and nothing else, so an added,
 * renamed or reordered line still comes back `false`.
 */
export function isSubsequence(baseline: string, current: string): boolean {
  const baselineLines = splitLines(baseline);
  const currentLines = splitLines(current);
  let matched = 0;
  for (const line of baselineLines) {
    if (matched < currentLines.length && currentLines[matched] === line) matched++;
  }
  return matched === currentLines.length;
}

/** Longest-common-subsequence table, built bottom-up so backtracking can walk it forward. */
function lcsTable(baseline: readonly string[], current: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: baseline.length + 1 }, () =>
    new Array(current.length + 1).fill(0),
  );
  for (let baselineIndex = baseline.length - 1; baselineIndex >= 0; baselineIndex--) {
    fillRow(table, baseline, current, baselineIndex);
  }
  return table;
}

function fillRow(
  table: number[][],
  baseline: readonly string[],
  current: readonly string[],
  baselineIndex: number,
): void {
  const row = table[baselineIndex] as number[];
  const nextRow = table[baselineIndex + 1] as number[];
  for (let currentIndex = current.length - 1; currentIndex >= 0; currentIndex--) {
    row[currentIndex] =
      baseline[baselineIndex] === current[currentIndex]
        ? (nextRow[currentIndex + 1] as number) + 1
        : Math.max(nextRow[currentIndex] as number, row[currentIndex + 1] as number);
  }
}

/** Both documents, each as its printed lines and the keys those lines are matched on. */
interface Sides {
  readonly baseline: readonly string[];
  readonly baselineKeys: readonly string[];
  readonly current: readonly string[];
  readonly currentKeys: readonly string[];
}

/** A cursor's position in each document while backtracking the LCS table. */
interface DiffCursor {
  baselineIndex: number;
  currentIndex: number;
}

/** `true` when the backtrack should prefer a deletion over an insertion at the cursor's position. */
function favorsDeletion(table: readonly number[][], cursor: DiffCursor): boolean {
  const { baselineIndex, currentIndex } = cursor;
  const deleteScore = (table[baselineIndex + 1] as number[])[currentIndex] as number;
  const insertScore = (table[baselineIndex] as number[])[currentIndex + 1] as number;
  return deleteScore >= insertScore;
}

/**
 * Emits exactly one line for the cursor's current position and advances it: unchanged context (two
 * lines whose KEYS agree, rendered by `context`), a deletion, or an insertion. Ties resolve to
 * deletion (see {@link favorsDeletion}), guaranteeing a removed line is emitted before its
 * replacement insertion.
 */
function emitNextLine(
  table: readonly number[][],
  sides: Sides,
  cursor: DiffCursor,
  context: ContextLine,
): string {
  const { baselineIndex, currentIndex } = cursor;
  const was = sides.baseline[baselineIndex] as string;
  if (sides.baselineKeys[baselineIndex] === sides.currentKeys[currentIndex]) {
    cursor.baselineIndex++;
    cursor.currentIndex++;
    return ` ${context(was, sides.current[currentIndex] as string)}`;
  }
  if (favorsDeletion(table, cursor)) {
    cursor.baselineIndex++;
    return `-${was}`;
  }
  cursor.currentIndex++;
  return `+${sides.current[currentIndex] as string}`;
}

function render(table: readonly number[][], sides: Sides, context: ContextLine): string {
  const lines: string[] = [];
  const cursor: DiffCursor = { baselineIndex: 0, currentIndex: 0 };
  while (
    cursor.baselineIndex < sides.baseline.length &&
    cursor.currentIndex < sides.current.length
  ) {
    lines.push(emitNextLine(table, sides, cursor, context));
  }
  while (cursor.baselineIndex < sides.baseline.length) {
    lines.push(`-${sides.baseline[cursor.baselineIndex++] as string}`);
  }
  while (cursor.currentIndex < sides.current.length) {
    lines.push(`+${sides.current[cursor.currentIndex++] as string}`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** The key two lines are matched on: equal keys are context even when the lines' bytes differ. */
export type LineKey = (line: string) => string;

/** Renders a matched pair (baseline line, current line) as one context line. */
export type ContextLine = (was: string, now: string) => string;

/**
 * Full unified line diff between two whole documents. Artifacts are small (one test scenario), so
 * no hunk elision is applied — the whole document stays readable.
 *
 * @param key what lines are matched on (default: the line itself). Removed lines print as the
 * baseline wrote them, added lines as the current document does.
 * @param context how a matched pair prints (default: the current document's line).
 */
export function unifiedLineDiff(
  baseline: string,
  current: string,
  key: LineKey = (line) => line,
  context: ContextLine = (_was, now) => now,
): string {
  const baselineLines = splitLines(baseline);
  const currentLines = splitLines(current);
  const sides: Sides = {
    baseline: baselineLines,
    baselineKeys: baselineLines.map(key),
    current: currentLines,
    currentKeys: currentLines.map(key),
  };
  return render(lcsTable(sides.baselineKeys, sides.currentKeys), sides, context);
}
