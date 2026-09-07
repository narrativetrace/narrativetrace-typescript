// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Glossary } from "./glossary.js";
import type { GlossaryTerm } from "./glossary-term.js";
import { termKey } from "./term-key.js";

/**
 * Lookup from a deprecated phrase to the canonical term that replaces it, scoped per context.
 *
 * INTENT: harvesting and violation reporting ask the same question — "is this normalized phrase a
 * deprecated alias here?" — so the answer is precomputed once per glossary instead of rescanning
 * every term's synonyms per observation.
 */
export interface AliasIndex {
  /**
   * Returns the canonical term that deprecates `alias` within `context`.
   *
   * @param context bounded context the phrase was observed in.
   * @param alias candidate phrase, in normalized form.
   * @returns the canonical term, or `undefined` — never `null` — when the phrase is not a
   * deprecated alias in that context. Matching is exact on the whole phrase: an alias never
   * matches a phrase that merely contains it.
   */
  readonly canonicalFor: (context: string, alias: string) => GlossaryTerm | undefined;
}

/**
 * Indexes a glossary's synonym declarations for alias lookup.
 *
 * INTENT: the one place synonym data is turned into a decision procedure, so "deprecated here"
 * means the same thing to the merger, to violation reporting, and to any later consumer.
 *
 * @param model the glossary whose terms declare the aliases.
 * @returns an index over every `(term context, synonym alias)` pair the glossary declares; a
 * glossary with no synonyms yields an index that answers `undefined` to everything.
 * @remarks Scoping is per context by construction: "parcel" can be shipping's canonical term and
 * billing's deprecated phrasing at once, and only billing's observations are flagged.
 * @example
 * ```ts
 * aliasIndex(model).canonicalFor("billing", "account with overdraft")?.term; // "overdraft account"
 * ```
 */
export function aliasIndex(model: Glossary): AliasIndex {
  const canonicalByAlias = new Map<string, GlossaryTerm>();
  for (const term of model.terms) {
    for (const synonym of term.synonyms) {
      canonicalByAlias.set(termKey(term.context, synonym.alias), term);
    }
  }
  return Object.freeze({
    canonicalFor: (context: string, alias: string) => canonicalByAlias.get(termKey(context, alias)),
  });
}
