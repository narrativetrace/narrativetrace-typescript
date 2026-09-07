// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The vocabulary one project has declared to be its own, as the clarity scorers see it.
 *
 * INTENT: make the built-in dictionaries extensible per project without a second configuration
 * file. A repository's committed glossary (ADR-012) is the single vocabulary source; the glossary
 * package maps it onto this type, and every dictionary consults it beside its own tiers. Clarity
 * therefore teaches in the project's own language instead of scoring its domain words as unknown.
 *
 * @remarks Two rules are deliberate and load-bearing. **Only single tokens count** — the scorers
 * tokenize identifiers, so a multi-word glossary phrase (`credit tranche`) can never match one
 * token and is dropped at construction rather than silently never matching. **The built-in
 * dictionaries keep their authority** — this type answers questions, it does not override answers;
 * each dictionary decides where the project vocabulary sits in its own precedence order, and none
 * lets a project promote a generic word to domain vocabulary.
 */
export interface DomainVocabulary {
  /** Normalized lowercase single-token verbs the project declares. */
  readonly verbs: ReadonlySet<string>;
  /** Normalized lowercase single-token nouns the project declares. */
  readonly nouns: ReadonlySet<string>;
  /**
   * Accepted shorthand, keyed by the normalized lowercase abbreviation, valued by its spelled-out
   * expansion — the glossary's `abbreviations` section (schema 2).
   */
  readonly abbreviations: ReadonlyMap<string, string>;
}

function isSingleToken(value: string): boolean {
  return value !== "" && !value.includes(" ");
}

function singleTokens(terms: Iterable<string>): ReadonlySet<string> {
  const kept = new Set<string>();
  for (const term of terms) {
    const normalized = term.trim().toLowerCase();
    if (isSingleToken(normalized)) kept.add(normalized);
  }
  return kept;
}

function singleTokenEntries(entries: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const kept = new Map<string, string>();
  for (const [abbreviation, expansion] of entries) {
    const token = abbreviation.trim().toLowerCase();
    if (isSingleToken(token) && expansion.trim() !== "") kept.set(token, expansion.trim());
  }
  return kept;
}

/**
 * Builds a vocabulary from raw declared terms, keeping only the single-token ones.
 *
 * @param verbs - verb terms; multi-word and blank entries are dropped
 * @param nouns - noun terms; multi-word and blank entries are dropped
 * @param abbreviations - accepted shorthand mapped to its expansion; multi-word and blank keys are
 * dropped, as is an entry whose expansion is blank — it could never teach anything
 */
export function domainVocabulary(
  verbs: Iterable<string>,
  nouns: Iterable<string>,
  abbreviations: ReadonlyMap<string, string> = new Map(),
): DomainVocabulary {
  return {
    verbs: singleTokens(verbs),
    nouns: singleTokens(nouns),
    abbreviations: singleTokenEntries(abbreviations),
  };
}

/**
 * The vocabulary of a project that has declared none — the default everywhere.
 *
 * @remarks An empty vocabulary is the normal state: a project without a committed glossary scores
 * exactly as it did before this type existed.
 */
export const emptyVocabulary: DomainVocabulary = domainVocabulary([], []);

/** Whether the project declared nothing this vocabulary can answer for. */
export function isEmptyVocabulary(vocabulary: DomainVocabulary): boolean {
  return (
    vocabulary.verbs.size === 0 &&
    vocabulary.nouns.size === 0 &&
    vocabulary.abbreviations.size === 0
  );
}

/** Whether the project declared this token as one of its verbs. */
export function isDomainVerb(vocabulary: DomainVocabulary, token: string): boolean {
  return vocabulary.verbs.has(token.toLowerCase());
}

/** Whether the project declared this token as one of its nouns. */
export function isDomainNoun(vocabulary: DomainVocabulary, token: string): boolean {
  return vocabulary.nouns.has(token.toLowerCase());
}

/**
 * Whether the project listed this token in its glossary's `abbreviations` section.
 *
 * @remarks Acceptance is a decision, not a side effect. Being a token of some committed term is
 * explicitly *not* enough: harvesting the phrase `calc total` must not silently accept `calc` as
 * shorthand repository-wide, because nobody read `calc` when they approved the phrase. Only the
 * `abbreviations` section (glossary schema 2) accepts shorthand, and the abbreviation dictionary
 * stops asking for a listed token to be spelled out.
 */
export function isAcceptedAbbreviation(vocabulary: DomainVocabulary, token: string): boolean {
  return vocabulary.abbreviations.has(token.toLowerCase());
}

/**
 * The project's spelled-out form of an accepted abbreviation.
 *
 * @returns the declared expansion (`fx` → `foreign exchange`), or `undefined` when the token is not
 * accepted shorthand. Lets a diagnostic teach from the project's own glossary instead of falling
 * silent on a word it has been told to accept.
 */
export function abbreviationExpansion(
  vocabulary: DomainVocabulary,
  token: string,
): string | undefined {
  return vocabulary.abbreviations.get(token.toLowerCase());
}
