// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Rejects a blank string at the entry of a model factory.
 *
 * INTENT: every identifying string in the glossary (context name, term text, alias) is a lookup
 * key. A blank key matches nothing a human meant and everything a bug produces, so it is refused
 * at construction rather than diagnosed later. Internal helper — not part of the public surface.
 *
 * @param value the candidate string.
 * @param what caller-facing name of the field, used verbatim in the error message.
 * @returns `value` unchanged, so the guard can wrap an assignment inline.
 * @throws {TypeError} if `value` is empty or contains only whitespace.
 */
export function requireNonBlank(value: string, what: string): string {
  if (value.trim() === "") throw new TypeError(`${what} must not be blank`);
  return value;
}

/**
 * Rejects anything that is not a whole count of at least one.
 *
 * INTENT: every count in this package is a tally of things actually observed, so zero, a negative,
 * and a fraction are all the same bug — a record built from something other than a real sighting.
 * Internal helper.
 *
 * @param value the candidate count.
 * @param what caller-facing name of the field, used verbatim in the error message.
 * @returns `value` unchanged, so the guard can wrap an assignment inline.
 * @throws {RangeError} if `value` is not an integer of at least 1.
 */
export function requirePositiveCount(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${what} must be a whole number of at least 1: ${value}`);
  }
  return value;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Rejects anything that is not a plain ISO calendar date (`YYYY-MM-DD`).
 *
 * INTENT: glossary dates are calendar days, not instants — a timestamp would carry a time zone and
 * make the committed file churn across machines. Dates are kept as strings for exactly that
 * reason, so this is the only place their shape is enforced. Internal helper.
 *
 * @param value the candidate date text.
 * @param what caller-facing name of the field, used verbatim in the error message.
 * @returns `value` unchanged, so the guard can wrap an assignment inline.
 * @throws {RangeError} if `value` is not `YYYY-MM-DD`, or names a day that does not exist
 * (`2026-02-30`, `2026-13-01`, a leap day in a common year).
 */
export function requireIsoDate(value: string, what: string): string {
  const parts = ISO_DATE.exec(value);
  if (parts === null) throw new RangeError(`${what} must be an ISO date (YYYY-MM-DD): '${value}'`);
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!exists) throw new RangeError(`${what} is not a real calendar date: '${value}'`);
  return value;
}
