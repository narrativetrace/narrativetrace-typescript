// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Every curation state a glossary term may be in; the literals are the `glossary.json` labels. */
export const TERM_STATUSES = ["harvested", "curated", "stale"] as const;

/**
 * Curation lifecycle of a glossary term.
 *
 * INTENT: distinguishes machine-harvested entries awaiting review (`harvested`) from human-reviewed
 * vocabulary (`curated`) and entries no longer observed in code (`stale`).
 *
 * @remarks Harvesting may create `harvested` entries but never changes a `curated` one; `stale` is
 * set only by an explicit human-invoked operation, never automatically — deletion stays a review
 * decision.
 */
export type TermStatus = (typeof TERM_STATUSES)[number];

/**
 * Narrows an untrusted string to a {@link TermStatus}.
 *
 * @param value candidate label, typically straight from parsed JSON.
 * @returns `true` when `value` is one of {@link TERM_STATUSES}.
 */
export function isTermStatus(value: unknown): value is TermStatus {
  return TERM_STATUSES.includes(value as TermStatus);
}
