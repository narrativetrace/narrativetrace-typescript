// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Separator between the two halves of a term key: NUL, built by code point so that no invisible
 * control character ever sits in this source file.
 *
 * INTENT: NUL is the one character that never appears in a context name or a normalized term —
 * both are derived from source identifiers. Every printable separator collides: with `/`, the
 * pairs `("a/b", "c")` and `("a", "b/c")` would share a key; with a space, so would
 * `("billing", "a b")` and `("billing a", "b")` — and normalized terms are space-separated by
 * construction.
 */
const SEPARATOR = String.fromCharCode(0);

/**
 * Encodes the identity of a term or alias — bounded context plus normalized text — as a string
 * usable as a `Map` or `Set` key.
 *
 * INTENT: every term and alias lookup keys on this pair, because the same normalized text is a
 * distinct concept in each context. TypeScript has no value equality for records, so identity is
 * carried by an injective string encoding instead.
 *
 * @param context bounded-context name.
 * @param text term or alias text, in normalized form.
 * @returns an opaque key; treat it as unparseable and compare it only for equality.
 */
export function termKey(context: string, text: string): string {
  return `${context}${SEPARATOR}${text}`;
}

/**
 * Encodes the identity of a harvest observation — every field that makes two sightings distinct —
 * as a string usable as a `Map` key.
 *
 * INTENT: aggregation counts repeats of the *same* observation, so its key must separate parts the
 * way {@link termKey} does; joining on any printable character would merge a phrase observed at
 * `A.b` with one observed at `A` from a method named `b`. Internal helper.
 *
 * @param parts the observation's identifying fields, in a fixed order chosen by the caller.
 * @returns an opaque key; treat it as unparseable and compare it only for equality.
 */
export function observationKey(parts: readonly string[]): string {
  return parts.join(SEPARATOR);
}
