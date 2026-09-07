// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type AliasIndex, aliasIndex } from "./alias-index.js";
import type { Glossary } from "./glossary.js";
import type { HarvestCandidate } from "./harvest-candidate.js";
import { suggestRename } from "./rename-suggester.js";
import { observationKey } from "./term-key.js";
import { compareText } from "./text-order.js";
import { type VocabularyViolation, vocabularyViolation } from "./vocabulary-violation.js";

function toViolation(candidate: HarvestCandidate, aliases: AliasIndex): VocabularyViolation {
  const { context, phrase, site, identifier, occurrences } = candidate;
  const canonical = aliases.canonicalFor(context, phrase);
  if (canonical === undefined) {
    throw new TypeError(`'${phrase}' is not a deprecated alias in context '${context}'`);
  }
  return vocabularyViolation({
    context,
    alias: phrase,
    canonicalTerm: canonical.term,
    site,
    identifier,
    suggestedIdentifier: suggestRename(identifier, phrase, canonical.term),
    occurrences,
  });
}

/** One violation per offending identifier at a site; kinds are a harvest concern, not a review one. */
function groupKey(violation: VocabularyViolation): string {
  return observationKey([violation.context, violation.alias, violation.site, violation.identifier]);
}

function withOccurrences(violation: VocabularyViolation, occurrences: number): VocabularyViolation {
  return vocabularyViolation({ ...violation, occurrences });
}

function compareViolations(left: VocabularyViolation, right: VocabularyViolation): number {
  return (
    compareText(left.context, right.context) ||
    compareText(left.alias, right.alias) ||
    compareText(left.site, right.site) ||
    compareText(left.identifier, right.identifier)
  );
}

/**
 * Turns the alias uses a merge suppressed into reviewable vocabulary violations.
 *
 * INTENT: the one aggregation point between the merger's raw observations and every violation
 * surface — console summary, `glossary-usage.json`, and the `non-canonical-term` clarity issue all
 * consume this list, so they cannot disagree about what was violated or how often.
 *
 * @param model the glossary whose synonym declarations caused the suppression.
 * @param suppressed the merge's {@link MergeResult.suppressedAliasUses}.
 * @returns violations ordered by `(context, alias, site, identifier)`, one per offending
 * identifier at a site, with occurrences summed across the kinds it was observed as.
 * @throws {TypeError} if a candidate's phrase is not a deprecated alias in its context — that
 * pairing can only come from a caller that did not get the list from a merge against this same
 * glossary, and silently dropping it would hide a real reporting bug.
 * @example
 * ```ts
 * const { suppressedAliasUses } = mergeHarvest(model, harvest, "2026-08-13");
 * collectViolations(model, suppressedAliasUses);
 * ```
 */
export function collectViolations(
  model: Glossary,
  suppressed: readonly HarvestCandidate[],
): readonly VocabularyViolation[] {
  const aliases = aliasIndex(model);
  const violations = new Map<string, VocabularyViolation>();
  for (const candidate of suppressed) {
    const violation = toViolation(candidate, aliases);
    const key = groupKey(violation);
    const seen = violations.get(key);
    violations.set(
      key,
      seen === undefined
        ? violation
        : withOccurrences(seen, seen.occurrences + violation.occurrences),
    );
  }
  return Object.freeze([...violations.values()].sort(compareViolations));
}
