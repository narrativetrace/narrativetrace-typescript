// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { BoundedContext } from "./bounded-context.js";
import type { GlossaryTerm } from "./glossary-term.js";
import { termKey } from "./term-key.js";
import { compareText } from "./text-order.js";

/**
 * The whole domain glossary of one repository: bounded contexts plus canonical terms.
 *
 * INTENT: the in-memory form of `glossary.json` — simultaneously the translation dictionary, the
 * reviewable domain documentation, and the vocabulary norm that clarity diagnostics enforce
 * (ADR-012).
 *
 * @remarks Structural invariants are enforced by {@link glossary}, so an inconsistent glossary
 * cannot exist. Terms are canonicalized to `(context, term)` order at construction, so two
 * glossaries holding the same vocabulary serialize identically whatever order they were built in.
 */
export interface Glossary {
  /** Glossary file schema version; `1`, or `2` once abbreviations are declared. */
  readonly schemaVersion: number;
  /** Bounded contexts, keyed by context name. */
  readonly contexts: ReadonlyMap<string, BoundedContext>;
  /** Canonical terms in `(context, term)` order; identity is that pair. */
  readonly terms: readonly GlossaryTerm[];
  /**
   * Accepted project shorthand mapped to its spelled-out expansion (`fx` → `foreign exchange`);
   * the root-level `abbreviations` section of schema 2.
   *
   * @remarks Human-owned, like `definition` and `translations`: harvesting never writes it, and a
   * merge carries it through untouched. It is the *only* thing that accepts shorthand — a token
   * appearing inside a committed term does not, because nobody read that token when they approved
   * the term.
   */
  readonly abbreviations: ReadonlyMap<string, string>;
}

/** Schema version this package writes for a glossary that declares no abbreviations. */
export const GLOSSARY_SCHEMA_VERSION = 1;

/**
 * Schema version introducing the root-level `abbreviations` section.
 *
 * @remarks Stamped only when that section is non-empty, so a repository that never uses the
 * feature keeps producing byte-identical schema-1 files.
 */
export const GLOSSARY_ABBREVIATIONS_SCHEMA_VERSION = 2;

/** Canonical term order of the glossary file: context name first, then term text. */
function compareTerms(left: GlossaryTerm, right: GlossaryTerm): number {
  const byContext = compareText(left.context, right.context);
  return byContext === 0 ? compareText(left.term, right.term) : byContext;
}

function requireDeclaredContexts(contexts: ReadonlyMap<string, BoundedContext>): void {
  for (const [key, context] of contexts) {
    if (context.name !== key) {
      throw new TypeError(`context '${context.name}' is filed under key '${key}'`);
    }
  }
}

function requireUniqueTerms(terms: readonly GlossaryTerm[]): Set<string> {
  const keys = new Set<string>();
  for (const term of terms) {
    const key = termKey(term.context, term.term);
    if (keys.has(key)) {
      throw new TypeError(`duplicate term '${term.term}' in context '${term.context}'`);
    }
    keys.add(key);
  }
  return keys;
}

function requireResolvableContexts(
  contexts: ReadonlyMap<string, BoundedContext>,
  terms: readonly GlossaryTerm[],
): void {
  for (const term of terms) {
    if (!contexts.has(term.context)) {
      throw new TypeError(`term '${term.term}' references undeclared context '${term.context}'`);
    }
  }
}

/**
 * Rejects an alias that is also a canonical term in the same context — the entry would tell a
 * reader to stop using a word the glossary itself canonicalizes. Across contexts it is legitimate:
 * "parcel" can be shipping's canonical term and billing's deprecated phrasing at once.
 */
function requireDisjointAliases(terms: readonly GlossaryTerm[], termKeys: ReadonlySet<string>) {
  for (const term of terms) {
    for (const synonym of term.synonyms) {
      if (termKeys.has(termKey(term.context, synonym.alias))) {
        throw new TypeError(
          `alias '${synonym.alias}' equals a canonical term in context '${term.context}'`,
        );
      }
    }
  }
}

/**
 * The version a glossary belongs to, given what it declares.
 *
 * INTENT: the stamp is a function of the content, decided once, here — so a model can never hold a
 * version its own fields contradict, and reading a written glossary always yields the model that
 * was written. Declaring shorthand raises a schema-1 glossary to 2; declaring none leaves the
 * version alone, which is what keeps a repository that never adopts the feature byte-identical. A
 * version already above 2 is never lowered.
 */
function canonicalSchemaVersion(
  schemaVersion: number,
  abbreviations: ReadonlyMap<string, string>,
): number {
  if (abbreviations.size === 0) return schemaVersion;
  return Math.max(GLOSSARY_ABBREVIATIONS_SCHEMA_VERSION, schemaVersion);
}

/**
 * Rejects an abbreviation that could never match an identifier token or teach a reader: a blank
 * key, or an expansion that says nothing. Both are authoring mistakes in a hand-curated section.
 */
function requireUsableAbbreviations(abbreviations: ReadonlyMap<string, string>): void {
  for (const [abbreviation, expansion] of abbreviations) {
    if (abbreviation.trim() === "") throw new TypeError("abbreviation must not be blank");
    if (expansion.trim() === "") {
      throw new TypeError(`abbreviation '${abbreviation}' must have a non-blank expansion`);
    }
  }
}

/** Every precondition of a glossary, in one place so {@link glossary} reads as construction. */
function requireInvariants(
  schemaVersion: number,
  contexts: ReadonlyMap<string, BoundedContext>,
  terms: readonly GlossaryTerm[],
  abbreviations: ReadonlyMap<string, string>,
): void {
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new RangeError(`schemaVersion must be a whole number of at least 1: ${schemaVersion}`);
  }
  requireDeclaredContexts(contexts);
  requireResolvableContexts(contexts, terms);
  requireDisjointAliases(terms, requireUniqueTerms(terms));
  requireUsableAbbreviations(abbreviations);
}

/**
 * Builds a validated, frozen {@link Glossary}, canonicalizing term order.
 *
 * INTENT: the single door into the aggregate — the JSON reader, the merger, and fixtures all come
 * through here, so every consumer downstream may assume the five structural invariants hold:
 * unique `(context, term)` identity, every term's context declared, aliases disjoint from
 * canonical terms within a context, contexts filed under their own name, and every declared
 * abbreviation usable.
 *
 * @param schemaVersion glossary file schema version; must be a whole number of at least 1.
 * @param contexts bounded contexts keyed by name; copied, so the caller's map stays safe to mutate.
 * @param terms canonical terms in any order; copied and sorted into `(context, term)` order.
 * @param abbreviations accepted shorthand mapped to its expansion; copied, and defaulting to none,
 * so every existing three-argument call keeps its meaning.
 * @returns the frozen glossary, whose `schemaVersion` is raised to 2 when it declares any
 * abbreviation — the stamp follows the content rather than the caller's word for it.
 * @throws {RangeError} if `schemaVersion` is not a whole number of at least 1.
 * @throws {TypeError} if any structural invariant above is violated.
 * @example
 * ```ts
 * glossary(GLOSSARY_SCHEMA_VERSION, new Map([["billing", boundedContext("billing", ["packages/billing"])]]), [
 *   glossaryTerm({ term: "overdraft account", context: "billing", kind: "noun-phrase", status: "harvested", firstSeen: "2026-08-13" }),
 * ]);
 * ```
 */
export function glossary(
  schemaVersion: number,
  contexts: ReadonlyMap<string, BoundedContext>,
  terms: readonly GlossaryTerm[],
  abbreviations: ReadonlyMap<string, string> = new Map(),
): Glossary {
  requireInvariants(schemaVersion, contexts, terms, abbreviations);
  return Object.freeze({
    schemaVersion: canonicalSchemaVersion(schemaVersion, abbreviations),
    contexts: new Map(contexts),
    terms: Object.freeze([...terms].sort(compareTerms)),
    abbreviations: new Map(abbreviations),
  });
}
