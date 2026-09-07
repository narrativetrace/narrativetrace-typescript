// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { requireNonBlank, requirePositiveCount } from "./guards.js";

/**
 * One use of a deprecated synonym in code, as a harvest run reports it.
 *
 * INTENT: the run-artifact form of "always use the canonical term" — it feeds the console summary,
 * `glossary-usage.json`, and the `non-canonical-term` clarity issue. Never written into the
 * committed glossary: violations are facts about a run, not about the vocabulary.
 */
export interface VocabularyViolation {
  /** Bounded context in which the alias is deprecated. */
  readonly context: string;
  /** The deprecated phrase that was observed, in normalized form. */
  readonly alias: string;
  /** The canonical term to use instead, in normalized form. */
  readonly canonicalTerm: string;
  /** Code site of the offending identifier: `Class.member`, or `Class`. */
  readonly site: string;
  /** The offending identifier, in its original spelling. */
  readonly identifier: string;
  /**
   * Mechanical rename to the canonical term; absent — never `null` — when the alias's tokens do
   * not appear contiguously in the identifier, so no rename can be derived without a human.
   */
  readonly suggestedIdentifier?: string;
  /** Uses observed at this site during the run; at least 1. */
  readonly occurrences: number;
}

/** Rejects every invalid field of `input`, before any copying work is done. */
function validate(input: VocabularyViolationInput): void {
  requireNonBlank(input.context, "violation context");
  requireNonBlank(input.alias, "alias");
  requireNonBlank(input.canonicalTerm, "canonicalTerm");
  requireNonBlank(input.site, "site");
  requireNonBlank(input.identifier, "identifier");
  requirePositiveCount(input.occurrences, "occurrences");
  if (input.suggestedIdentifier !== undefined) {
    requireNonBlank(input.suggestedIdentifier, "suggestedIdentifier");
  }
}

/**
 * Constructor arguments for {@link vocabularyViolation}.
 *
 * @remarks `suggestedIdentifier` accepts an explicit `undefined` as well as being absent, unlike
 * {@link VocabularyViolation} itself where absent is the only representation of "no rename could be
 * derived". Callers get it straight from {@link suggestRename}, which naturally yields `undefined`,
 * and under the repository's `exactOptionalPropertyTypes` a stricter input type would push a
 * conditional spread onto every one of them.
 */
export interface VocabularyViolationInput extends Omit<VocabularyViolation, "suggestedIdentifier"> {
  /** See {@link VocabularyViolation.suggestedIdentifier}. */
  readonly suggestedIdentifier?: string | undefined;
}

/**
 * Builds a frozen {@link VocabularyViolation}.
 *
 * INTENT: the single validated door into violation reporting, so no surface — console, JSON
 * report, clarity issue — can be handed a violation that names a blank term or suggests renaming
 * an identifier to nothing.
 *
 * @param input the violation's fields; `suggestedIdentifier` is the only optional one, and an
 * explicit `undefined` for it means the same as leaving it out.
 * @returns the frozen violation, with `suggestedIdentifier` omitted when it was not supplied.
 * @throws {TypeError} if any string field is blank.
 * @throws {RangeError} if `occurrences` is not a whole number of at least 1.
 * @example
 * ```ts
 * vocabularyViolation({
 *   context: "billing",
 *   alias: "account with overdraft",
 *   canonicalTerm: "overdraft account",
 *   site: "OverdraftService.openAccountWithOverdraft",
 *   identifier: "openAccountWithOverdraft",
 *   suggestedIdentifier: "openOverdraftAccount",
 *   occurrences: 2,
 * });
 * ```
 */
export function vocabularyViolation(input: VocabularyViolationInput): VocabularyViolation {
  validate(input);
  return Object.freeze({
    context: input.context,
    alias: input.alias,
    canonicalTerm: input.canonicalTerm,
    site: input.site,
    identifier: input.identifier,
    ...(input.suggestedIdentifier !== undefined
      ? { suggestedIdentifier: input.suggestedIdentifier }
      : {}),
    occurrences: input.occurrences,
  });
}
