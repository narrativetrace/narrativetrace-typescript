// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { VocabularyViolation } from "./vocabulary-violation.js";

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function headline(newTermCount: number, violationCount: number): string {
  const harvested = `Vocabulary: ${counted(newTermCount, "new term harvested", "new terms harvested")}`;
  if (violationCount === 0) return harvested;
  const inUse = counted(violationCount, "deprecated synonym in use", "deprecated synonyms in use");
  return `${harvested}, ${inUse}`;
}

/** With a rename the line is actionable as-is; without one it can only name the right word. */
function detailLine(violation: VocabularyViolation): string {
  const { identifier, suggestedIdentifier, context, canonicalTerm } = violation;
  if (suggestedIdentifier !== undefined) {
    return `${identifier} → use ${suggestedIdentifier} (${context}: "${canonicalTerm}")`;
  }
  return `${identifier} → use canonical term "${canonicalTerm}" (${context})`;
}

/**
 * Formats the vocabulary block of the suite's console summary.
 *
 * INTENT: keeps the test-runner reporter free of formatting detail while giving a developer the
 * one thing worth reading at the end of a run — how much vocabulary the run added, and which
 * identifiers still say it the deprecated way.
 *
 * @param newTermCount terms this run added to the glossary.
 * @param violations the run's vocabulary violations, in the order they should be listed.
 * @returns the block without a trailing newline: a headline, then one indented detail line per
 * violation. With no violations it is the headline alone.
 * @throws {RangeError} if `newTermCount` is negative or fractional.
 * @example
 * ```ts
 * formatVocabularySummary(3, violations);
 * // Vocabulary: 3 new terms harvested, 1 deprecated synonym in use
 * //   openAccountWithOverdraft → use openOverdraftAccount (billing: "overdraft account")
 * ```
 */
export function formatVocabularySummary(
  newTermCount: number,
  violations: readonly VocabularyViolation[],
): string {
  if (!Number.isInteger(newTermCount) || newTermCount < 0) {
    throw new RangeError(`newTermCount must be a whole number of at least 0: ${newTermCount}`);
  }
  return [
    headline(newTermCount, violations.length),
    ...violations.map((violation) => `  ${detailLine(violation)}`),
  ].join("\n");
}
