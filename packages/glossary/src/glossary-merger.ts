// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { aliasIndex } from "./alias-index.js";
import { type BoundedContext, boundedContext } from "./bounded-context.js";
import { UNASSIGNED_CONTEXT } from "./context-resolver.js";
import { type Glossary, glossary } from "./glossary.js";
import { type GlossaryTerm, glossaryTerm } from "./glossary-term.js";
import { requireIsoDate } from "./guards.js";
import type { HarvestCandidate } from "./harvest-candidate.js";
import { termKey } from "./term-key.js";
import type { TermKind } from "./term-kind.js";

/** How many observed sites a new term records — evidence for review, not an exhaustive index. */
const SOURCE_LIMIT = 3;

const UNASSIGNED_DESCRIPTION = "Harvested terms not yet mapped to a context";

/**
 * Outcome of one additive merge of a harvest into an existing glossary.
 *
 * INTENT: the single value all run output derives from — the merged glossary is written back to
 * disk, `newTerms` feeds the console summary, and `suppressedAliasUses` feeds vocabulary-violation
 * reporting.
 */
export interface MergeResult {
  /** The merged glossary: a superset of the input, with no existing entry altered. */
  readonly glossary: Glossary;
  /** Terms this merge added, in the order the harvest first observed them. */
  readonly newTerms: readonly GlossaryTerm[];
  /**
   * Observations whose phrase is a deprecated alias in its context — kept out of the glossary and
   * reported as vocabulary violations instead.
   */
  readonly suppressedAliasUses: readonly HarvestCandidate[];
}

/** A new term being assembled from every observation of one `(context, phrase)` pair. */
interface Accumulator {
  readonly context: string;
  readonly phrase: string;
  readonly kind: TermKind;
  readonly sites: Set<string>;
}

/** Sorts observations into suppressed alias uses and accumulators for genuinely new terms. */
function classify(
  existing: Glossary,
  harvest: readonly HarvestCandidate[],
  suppressed: HarvestCandidate[],
): Map<string, Accumulator> {
  const aliases = aliasIndex(existing);
  const known = new Set(existing.terms.map((term) => termKey(term.context, term.term)));
  const unseen = new Map<string, Accumulator>();
  for (const candidate of harvest) {
    const { context, phrase, kind, site } = candidate;
    const key = termKey(context, phrase);
    if (aliases.canonicalFor(context, phrase) !== undefined) suppressed.push(candidate);
    else if (!known.has(key)) accumulate(unseen, key, { context, phrase, kind, site });
  }
  return unseen;
}

/** First observation wins the kind; later ones only widen the evidence, up to the cap. */
function accumulate(
  unseen: Map<string, Accumulator>,
  key: string,
  observation: { context: string; phrase: string; kind: TermKind; site: string },
): void {
  const seen = unseen.get(key);
  if (seen === undefined) {
    unseen.set(key, { ...observation, sites: new Set([observation.site]) });
  } else if (seen.sites.size < SOURCE_LIMIT) {
    seen.sites.add(observation.site);
  }
}

function newTerm(accumulator: Accumulator, firstSeen: string): GlossaryTerm {
  return glossaryTerm({
    term: accumulator.phrase,
    context: accumulator.context,
    kind: accumulator.kind,
    status: "harvested",
    sources: [...accumulator.sites],
    firstSeen,
  });
}

/** A context a harvest brought in declares no prefixes — only a human can say what it owns. */
function declaredContext(name: string): BoundedContext {
  return name === UNASSIGNED_CONTEXT
    ? boundedContext(name, [], UNASSIGNED_DESCRIPTION)
    : boundedContext(name, []);
}

function mergedContexts(
  existing: Glossary,
  newTerms: readonly GlossaryTerm[],
): Map<string, BoundedContext> {
  const contexts = new Map(existing.contexts);
  for (const term of newTerms) {
    if (!contexts.has(term.context)) contexts.set(term.context, declaredContext(term.context));
  }
  return contexts;
}

/**
 * The existing glossary with this merge's terms appended.
 *
 * @remarks Additivity is structural: the existing terms are spread ahead of the new ones and
 * nothing is rewritten. Everything human-owned — definitions, translations, accepted
 * abbreviations — is carried across untouched, because a harvest observes identifiers and an
 * identifier is never evidence of a human decision.
 */
function withNewTerms(existing: Glossary, newTerms: readonly GlossaryTerm[]): Glossary {
  return glossary(
    existing.schemaVersion,
    mergedContexts(existing, newTerms),
    [...existing.terms, ...newTerms],
    existing.abbreviations,
  );
}

/**
 * Merges harvested observations into a glossary, additively.
 *
 * INTENT: the merge rules of ADR-012, enforced structurally — existing entries are never removed
 * or mutated (human-authored fields are sacrosanct), unseen `(context, phrase)` pairs join as
 * `harvested` terms, phrases deprecated as aliases are suppressed and reported, and re-merging the
 * same harvest is a no-op.
 *
 * @param existing the glossary to merge into; returned unchanged when the harvest adds nothing.
 * @param harvest observations of one run, as {@link harvestTraces} produced them.
 * @param firstSeen ISO calendar date (`YYYY-MM-DD`) stamped on terms created by this merge; the
 * caller supplies it so a harvest is a pure function of its inputs and re-runnable.
 * @returns the merged glossary plus this merge's new terms and suppressed alias uses.
 * @throws {RangeError} if `firstSeen` is not a real ISO calendar date.
 * @remarks Additivity is structural rather than asserted: the merged term list is the existing one
 * spread ahead of terms whose `(context, phrase)` key was proven absent, and {@link glossary}
 * refuses a duplicate identity outright. There is no code path that could rewrite an entry, so
 * there is no postcondition worth checking at runtime — the property test is what holds the line
 * if that construction is ever changed.
 * @remarks Staleness is not decided here. A term no longer observed keeps its entry; marking it
 * stale is an explicit human-invoked operation, because deletion is a review decision.
 * @remarks The `abbreviations` section passes through untouched. It is human-owned, like
 * `definition` and `translations` — a harvest observes identifiers, and no identifier can be
 * evidence that a project has *decided* to accept a piece of shorthand.
 * @example
 * ```ts
 * const { glossary, newTerms, suppressedAliasUses } = mergeHarvest(model, harvest, "2026-08-13");
 * ```
 */
export function mergeHarvest(
  existing: Glossary,
  harvest: readonly HarvestCandidate[],
  firstSeen: string,
): MergeResult {
  requireIsoDate(firstSeen, "firstSeen");
  const suppressedAliasUses: HarvestCandidate[] = [];
  const newTerms = [...classify(existing, harvest, suppressedAliasUses).values()].map(
    (accumulator) => newTerm(accumulator, firstSeen),
  );
  return Object.freeze({
    glossary: withNewTerms(existing, newTerms),
    newTerms: Object.freeze(newTerms),
    suppressedAliasUses: Object.freeze(suppressedAliasUses),
  });
}
