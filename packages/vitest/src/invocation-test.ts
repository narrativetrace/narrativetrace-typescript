// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The row shape `createNarrativeTest(...).each(cases)` accepts: a tuple of positional arguments, or
 * a named-fields object. Tagged-template tables (`` .each`a | b\n1 | 2` ``) are not supported — this
 * is a deliberate, documented adaptation (see the port's report), not an oversight.
 */
export type EachRow = readonly unknown[] | Readonly<Record<string, unknown>>;

function isArrayRow(row: EachRow): row is readonly unknown[] {
  return Array.isArray(row);
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Interpolates one `.each` row into its display label: a small, documented subset of Jest/Vitest's
 * own conventions — `%s`/`%d`/`%i`/`%j`/`%o` positionally for a tuple row, `$key` for a named-field
 * row, and `%#` for the 1-based invocation index in either shape. A placeholder with nothing to fill
 * it passes through unresolved rather than throwing, so a template typo is visible instead of fatal.
 */
export function interpolateEachName(template: string, row: EachRow, index: number): string {
  if (isArrayRow(row)) {
    let cursor = 0;
    return template
      .replace(/%[sdifjoO]/g, () => (cursor < row.length ? displayValue(row[cursor++]) : "%!"))
      .replace(/%#/g, String(index));
  }
  return template
    .replace(/\$([a-zA-Z_$][\w$]*)/g, (whole, key: string) =>
      key in row ? displayValue(row[key]) : whole,
    )
    .replace(/%#/g, String(index));
}

/** The arguments Vitest's own `.each` passes a row's test function, before the fixtures object. */
export function eachRowArgs(row: EachRow): unknown[] {
  return isArrayRow(row) ? [...row] : [row];
}

/** A bare scalar row (`.each(["TENT", "KAYAK"])`) becomes its own single-element tuple. */
function normalizeRow(row: unknown): EachRow {
  if (Array.isArray(row)) return row;
  if (row !== null && typeof row === "object") return row as Record<string, unknown>;
  return [row];
}

/**
 * Validates and returns `cases` as an array of rows, wrapping a bare scalar row (a plain string,
 * number, etc.) as its own single-element tuple — the same convenience Jest/Vitest's own `.each`
 * gives a table of plain values.
 *
 * @throws {TypeError} for anything but a plain array — most commonly a tagged-template table
 * (`` .each`a | b` ``), which this port's `.each` does not support; pass an array of rows instead.
 */
export function normalizeEachCases(cases: unknown): EachRow[] {
  if (!Array.isArray(cases)) {
    throw new TypeError(
      "createNarrativeTest(...).each expects an array of rows (arrays, objects, or scalars); " +
        "a tagged-template table is not supported.",
    );
  }
  return cases.map(normalizeRow);
}
