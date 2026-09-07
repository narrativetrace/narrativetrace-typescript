// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClarityIssue } from "@narrativetrace/clarity";
import type { VocabularyViolation } from "./vocabulary-violation.js";

/** Clarity issue category that vocabulary violations are reported under. */
export const NON_CANONICAL_TERM = "non-canonical-term";

/**
 * Clarity's weight for a `MEDIUM` issue.
 *
 * @remarks Mirrored rather than imported because clarity exports no issue factory. Drift is
 * bounded: clarity recomputes `impactScore` from severity and occurrences whenever it aggregates
 * issues, so a mismatch here can only be visible on an issue nothing ever grouped.
 */
const MEDIUM_WEIGHT = 2;

function suggestion(violation: VocabularyViolation): string {
  const canonical = `use canonical term '${violation.canonicalTerm}'`;
  return violation.suggestedIdentifier === undefined
    ? canonical
    : `${canonical} → rename to ${violation.suggestedIdentifier}`;
}

function toIssue(violation: VocabularyViolation): ClarityIssue {
  return {
    category: NON_CANONICAL_TERM,
    element: `${violation.context}.${violation.site}`,
    suggestion: suggestion(violation),
    severity: "MEDIUM",
    occurrences: violation.occurrences,
    impactScore: MEDIUM_WEIGHT * violation.occurrences,
  };
}

/**
 * Maps vocabulary violations onto the clarity issue surface.
 *
 * INTENT: vocabulary governance ships without inventing a report format. `clarity-report.md`,
 * `clarity-results.json` and the clarity gate all consume {@link ClarityIssue}, so a violation
 * expressed as one rides every existing surface, including CI, unchanged.
 *
 * @param violations the run's violations, as {@link collectViolations} ordered them.
 * @returns one issue per violation, in the same order, element `context.site`, severity `MEDIUM`.
 * @remarks Severity is fixed at `MEDIUM` by the plan: a deprecated synonym is a real naming defect
 * but never a broken build on its own — the gate decides that, not this mapping.
 * @example
 * ```ts
 * nonCanonicalTermIssues(collectViolations(model, suppressedAliasUses));
 * ```
 */
export function nonCanonicalTermIssues(
  violations: readonly VocabularyViolation[],
): readonly ClarityIssue[] {
  return Object.freeze(violations.map(toIssue));
}
