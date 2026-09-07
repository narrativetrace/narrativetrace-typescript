// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Every grammatical shape a glossary term may take, in the order the Markdown view renders them.
 *
 * @remarks The literals are the `glossary.json` labels verbatim, so no name mapping exists to
 * drift — the Java runtime needs `TermKind.jsonName()` only because its enum constants are
 * upper-case.
 */
export const TERM_KINDS = ["word", "noun-phrase", "verb-phrase", "template"] as const;

/**
 * Grammatical shape of a glossary term.
 *
 * INTENT: lets harvesting and translation treat words, phrases, and narration templates
 * differently — template entries key on raw template text and hold per-locale template variants,
 * while word and phrase entries key on normalized identifier language.
 */
export type TermKind = (typeof TERM_KINDS)[number];

/**
 * Narrows an untrusted string to a {@link TermKind}.
 *
 * INTENT: the reader's gate for a hand-edited `kind` label — a typo must fail the load loudly
 * instead of silently becoming an unrenderable term.
 *
 * @param value candidate label, typically straight from parsed JSON.
 * @returns `true` when `value` is one of {@link TERM_KINDS}.
 */
export function isTermKind(value: unknown): value is TermKind {
  return TERM_KINDS.includes(value as TermKind);
}

/**
 * Narrows an untrusted value to a {@link TermKind}, or rejects it.
 *
 * INTENT: every door into the model — the JSON reader, the term factory, the harvester — refuses
 * an unknown kind with the same words, so the message a user sees does not depend on which door
 * they came through. Internal helper.
 *
 * @param value candidate label, typically straight from parsed JSON or a caller's literal.
 * @returns `value` narrowed to {@link TermKind}, so the guard can wrap an assignment inline.
 * @throws {TypeError} if `value` is not one of {@link TERM_KINDS}.
 */
export function requireTermKind(value: unknown): TermKind {
  if (!isTermKind(value)) throw new TypeError(`unknown term kind '${value}'`);
  return value;
}
