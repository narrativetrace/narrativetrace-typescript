// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { splitKeepingTerminators } from "./marked-block.js";

/**
 * The smallest unified diff that tells the truth about one file.
 *
 * INTENT: `--dry-run` has to SHOW what would change, and this library takes zero dependencies. The
 * algorithm is deliberately not Myers: the common prefix and suffix are trimmed and everything between
 * them is shown as removed-then-added, in one hunk with three lines of context.
 *
 * @llmNote The result is a correct unified diff, not a MINIMAL one. For what the installer actually
 * edits — a delimited section inside a file, or a page it rewrites whole — the trimmed middle IS the
 * change. Trading minimality away buys a diff with no quadratic table in it, which is what makes this
 * safe on a file of any size.
 *
 * @llmNote A line keeps a carriage return it had, so a change of line endings shows as a changed line
 * rather than as nothing at all.
 */

const CONTEXT = 3;

const NO_NEWLINE = "\\ No newline at end of file";

/** Lines without their newline; a carriage return stays, so an ending change is visible. */
function linesOf(text: string): string[] {
  return splitKeepingTerminators(text).map((line) =>
    line.endsWith("\n") ? line.slice(0, -1) : line,
  );
}

function commonPrefix(old: readonly string[], current: readonly string[]): number {
  let i = 0;
  while (i < old.length && i < current.length && old[i] === current[i]) i++;
  return i;
}

function commonSuffix(old: readonly string[], current: readonly string[], prefix: number): number {
  let i = 0;
  while (
    i < old.length - prefix &&
    i < current.length - prefix &&
    old[old.length - 1 - i] === current[current.length - 1 - i]
  ) {
    i++;
  }
  return i;
}

/** The `start,count` half of a hunk header: a side with no lines starts at 0. */
function header(start: number, count: number, empty: boolean): string {
  return empty ? "0,0" : `${start + 1},${count}`;
}

/** One side's changed lines, each marked, with the missing-final-newline note where it belongs. */
function side(
  lines: readonly string[],
  from: number,
  to: number,
  sign: string,
  text: string,
): string[] {
  const out: string[] = [];
  for (let i = from; i < to; i++) {
    out.push(`${sign}${lines[i]}`);
    if (i === lines.length - 1 && !text.endsWith("\n")) out.push(NO_NEWLINE);
  }
  return out;
}

interface Hunk {
  readonly old: readonly string[];
  readonly current: readonly string[];
  readonly prefix: number;
  readonly suffix: number;
}

function hunkLines(hunk: Hunk, before: string, after: string): string[] {
  const { old, current, prefix, suffix } = hunk;
  const start = Math.max(0, prefix - CONTEXT);
  const oldEnd = Math.min(old.length, old.length - suffix + CONTEXT);
  const newEnd = Math.min(current.length, current.length - suffix + CONTEXT);
  return [
    `@@ -${header(start, oldEnd - start, old.length === 0)}` +
      ` +${header(start, newEnd - start, current.length === 0)} @@`,
    ...old.slice(start, prefix).map((line) => ` ${line}`),
    ...side(old, prefix, old.length - suffix, "-", before),
    ...side(current, prefix, current.length - suffix, "+", after),
    ...old.slice(old.length - suffix, oldEnd).map((line) => ` ${line}`),
  ];
}

/**
 * The diff of one file, or `""` when the two texts are equal.
 *
 * @param path the label both sides are named with
 * @param before the whole file before, `""` when it did not exist
 * @param after the whole file after, `""` when it is being deleted
 */
export function renderUnifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return "";
  const old = linesOf(before);
  const current = linesOf(after);
  const prefix = commonPrefix(old, current);
  const suffix = commonSuffix(old, current, prefix);
  return [
    `--- ${before === "" ? "/dev/null" : `a/${path}`}`,
    `+++ ${after === "" ? "/dev/null" : `b/${path}`}`,
    ...hunkLines({ old, current, prefix, suffix }, before, after),
    "",
  ].join("\n");
}
