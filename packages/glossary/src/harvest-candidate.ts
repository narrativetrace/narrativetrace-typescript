// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { requireNonBlank, requirePositiveCount } from "./guards.js";
import { requireTermKind, type TermKind } from "./term-kind.js";

/**
 * One aggregated observation of a normalized phrase at a code site during harvesting.
 *
 * INTENT: the bridge between traces and the glossary. The merger turns unseen `(context, phrase)`
 * pairs into new terms, alias hits become vocabulary violations, and everything else is
 * usage-report material only — so an observation carries both the phrase and the evidence for it.
 *
 * @remarks Distinct from {@link TermCandidate}, which is the phrase alone as normalization
 * produced it, with no idea where it came from.
 */
export interface HarvestCandidate {
  /** Bounded context resolved from the declaring module's source path. */
  readonly context: string;
  /** Normalized phrase, as produced by the term normalizer. */
  readonly phrase: string;
  /** Grammatical shape of the phrase. */
  readonly kind: TermKind;
  /** Observed code site: `Class.member`, or `Class` for a class-name observation. */
  readonly site: string;
  /** Raw identifier the phrase was normalized from. */
  readonly identifier: string;
  /** How many times this exact observation appeared in the harvested run; at least 1. */
  readonly occurrences: number;
}

/**
 * Builds a frozen {@link HarvestCandidate}.
 *
 * INTENT: the single validated door into the harvest vocabulary — the harvester and hand-written
 * fixtures both come through here, so a violation report can never name a blank site or a phrase
 * that was never actually seen.
 *
 * @param input the observation's fields.
 * @returns the frozen observation.
 * @throws {TypeError} if `context`, `phrase`, `site` or `identifier` is blank, or if `kind` is
 * outside the declared taxonomy.
 * @throws {RangeError} if `occurrences` is not a whole number of at least 1 — an aggregated
 * observation exists because it was observed.
 * @example
 * ```ts
 * harvestCandidate({
 *   context: "billing",
 *   phrase: "overdraft account",
 *   kind: "noun-phrase",
 *   site: "OverdraftService.openOverdraftAccount",
 *   identifier: "openOverdraftAccount",
 *   occurrences: 1,
 * });
 * ```
 */
export function harvestCandidate(input: HarvestCandidate): HarvestCandidate {
  requireNonBlank(input.context, "candidate context");
  requireNonBlank(input.phrase, "phrase");
  requireNonBlank(input.site, "site");
  requireNonBlank(input.identifier, "identifier");
  requireTermKind(input.kind);
  requirePositiveCount(input.occurrences, "occurrences");
  return Object.freeze({
    context: input.context,
    phrase: input.phrase,
    kind: input.kind,
    site: input.site,
    identifier: input.identifier,
    occurrences: input.occurrences,
  });
}
