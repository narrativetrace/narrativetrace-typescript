// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { requireIsoDate, requireNonBlank } from "./guards.js";
import type { SynonymAlias } from "./synonym-alias.js";
import { requireTermKind, type TermKind } from "./term-kind.js";
import { isTermStatus, type TermStatus } from "./term-status.js";

/**
 * One entry of the domain glossary: a canonical term within a bounded context.
 *
 * INTENT: the unit of ubiquitous language. Term identity is `(context, term)`; the same term may
 * exist independently in two contexts with different definitions and translations — that is the
 * point of bounding, and it is why context improves translation quality.
 *
 * @remarks Human-owned fields (`definition`, `translations`, `synonyms`, and a `curated` status)
 * are never overwritten by harvesting. Volatile statistics — occurrence counts, last-seen dates —
 * deliberately have no home here; they belong to run reports, so an unchanged vocabulary leaves
 * the committed file byte-identical.
 */
export interface GlossaryTerm {
  /** Canonical term in normalized form (lowercase, space-separated). */
  readonly term: string;
  /** Name of the bounded context this term belongs to; must be declared by the glossary. */
  readonly context: string;
  /** Grammatical shape of the term. */
  readonly kind: TermKind;
  /** Curation lifecycle state. */
  readonly status: TermStatus;
  /** Human-written meaning; absent — never `null` — until someone curates the entry. */
  readonly definition?: string;
  /** Locale tag to translated term; empty until curated. */
  readonly translations: ReadonlyMap<string, string>;
  /** Deprecated aliases of this term; empty for a freshly harvested entry. */
  readonly synonyms: readonly SynonymAlias[];
  /** First observed code sites, as `Class.member` strings. */
  readonly sources: readonly string[];
  /** ISO calendar date (`YYYY-MM-DD`) the term entered the glossary; set once, never updated. */
  readonly firstSeen: string;
}

/**
 * Constructor arguments for {@link glossaryTerm}: the four identifying fields plus `firstSeen` are
 * required, every human-curated field is optional.
 *
 * @remarks Optional fields accept an explicit `undefined` as well as being absent, unlike
 * {@link GlossaryTerm} itself where absent is the only representation of "not curated". Callers
 * assemble these from parsed JSON and lookups that naturally yield `undefined`, and under the
 * repository's `exactOptionalPropertyTypes` a stricter input type would force every one of them
 * into conditional spreads.
 */
export interface GlossaryTermInput {
  /** See {@link GlossaryTerm.term}. */
  readonly term: string;
  /** See {@link GlossaryTerm.context}. */
  readonly context: string;
  /** See {@link GlossaryTerm.kind}. */
  readonly kind: TermKind;
  /** See {@link GlossaryTerm.status}. */
  readonly status: TermStatus;
  /** See {@link GlossaryTerm.firstSeen}. */
  readonly firstSeen: string;
  /** See {@link GlossaryTerm.definition}. */
  readonly definition?: string | undefined;
  /** See {@link GlossaryTerm.translations}. @defaultValue an empty map */
  readonly translations?: ReadonlyMap<string, string> | undefined;
  /** See {@link GlossaryTerm.synonyms}. @defaultValue an empty list */
  readonly synonyms?: readonly SynonymAlias[] | undefined;
  /** See {@link GlossaryTerm.sources}. @defaultValue an empty list */
  readonly sources?: readonly string[] | undefined;
}

/** Rejects every invalid field of `input`, before any copying work is done. */
function validate(input: GlossaryTermInput): void {
  requireNonBlank(input.term, "term");
  requireNonBlank(input.context, "term context");
  requireTermKind(input.kind);
  if (!isTermStatus(input.status)) throw new TypeError(`unknown term status '${input.status}'`);
  requireIsoDate(input.firstSeen, "firstSeen");
  for (const locale of input.translations?.keys() ?? []) {
    requireNonBlank(locale, "translation locale");
  }
}

/**
 * Builds a frozen {@link GlossaryTerm}, defensively copying every collection.
 *
 * INTENT: the single validated door into the model — the JSON reader, the harvester, and hand-
 * written fixtures all come through here, so an inconsistent term cannot exist anywhere.
 *
 * @param input the term's fields; see {@link GlossaryTermInput} for which are optional.
 * @returns the frozen term; `translations`, `synonyms` and `sources` are copies, so the caller's
 * collections stay safe to mutate.
 * @throws {TypeError} if `term` or `context` is blank, if `kind` or `status` is outside the
 * declared taxonomy, or if a translation locale is blank.
 * @throws {RangeError} if `firstSeen` is not a real ISO calendar date.
 * @example
 * ```ts
 * glossaryTerm({
 *   term: "overdraft account",
 *   context: "billing",
 *   kind: "noun-phrase",
 *   status: "harvested",
 *   firstSeen: "2026-08-13",
 * });
 * ```
 */
export function glossaryTerm(input: GlossaryTermInput): GlossaryTerm {
  validate(input);
  return Object.freeze({
    term: input.term,
    context: input.context,
    kind: input.kind,
    status: input.status,
    ...(input.definition !== undefined ? { definition: input.definition } : {}),
    translations: new Map(input.translations ?? []),
    synonyms: Object.freeze([...(input.synonyms ?? [])]),
    sources: Object.freeze([...(input.sources ?? [])]),
    firstSeen: input.firstSeen,
  });
}
