// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Total order on text, by UTF-16 code unit.
 *
 * INTENT: every ordering decision in this package ends up as bytes in a committed file — term
 * order in `glossary.json`, context sections in `glossary.md`, translation locales. A
 * locale-sensitive collation (`localeCompare`) would order those differently on a German
 * developer's machine than in CI, so the file would churn on whose machine last ran the harvest.
 * This comparator is the single place that decision is made. Internal helper.
 *
 * @param left first text.
 * @param right second text.
 * @returns negative, zero, or positive per the comparator contract.
 */
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Entries of a map in ascending key order, using {@link compareText}.
 *
 * @param map any string-keyed map.
 * @returns a new array of entries; the map itself is untouched.
 */
export function byKey<T>(map: ReadonlyMap<string, T>): [string, T][] {
  return [...map.entries()].sort(([left], [right]) => compareText(left, right));
}
