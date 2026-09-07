// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { formatVocabularySummary } from "../src/vocabulary-summary.js";
import { vocabularyViolation } from "../src/vocabulary-violation.js";

const VIOLATION = vocabularyViolation({
  context: "billing",
  alias: "account with overdraft",
  canonicalTerm: "overdraft account",
  site: "OverdraftService.openAccountWithOverdraft",
  identifier: "openAccountWithOverdraft",
  suggestedIdentifier: "openOverdraftAccount",
  occurrences: 1,
});

describe("formatVocabularySummary", () => {
  test("reports the harvest alone when the vocabulary was respected", () => {
    expect(formatVocabularySummary(3, [])).toBe("Vocabulary: 3 new terms harvested");
  });

  test.each([
    [0, "Vocabulary: 0 new terms harvested"],
    [1, "Vocabulary: 1 new term harvested"],
    [2, "Vocabulary: 2 new terms harvested"],
  ])("counts %i new terms in the reader's grammar", (count, expected) => {
    expect(formatVocabularySummary(count, [])).toBe(expected);
  });

  test("names every deprecated synonym in use, with the rename that fixes it", () => {
    expect(formatVocabularySummary(3, [VIOLATION])).toBe(
      [
        "Vocabulary: 3 new terms harvested, 1 deprecated synonym in use",
        '  openAccountWithOverdraft → use openOverdraftAccount (billing: "overdraft account")',
      ].join("\n"),
    );
  });

  test("falls back to naming the canonical term when no rename could be derived", () => {
    const { suggestedIdentifier: _none, ...unrenameable } = VIOLATION;

    expect(formatVocabularySummary(0, [vocabularyViolation(unrenameable)])).toBe(
      [
        "Vocabulary: 0 new terms harvested, 1 deprecated synonym in use",
        '  openAccountWithOverdraft → use canonical term "overdraft account" (billing)',
      ].join("\n"),
    );
  });

  test("counts several violations in the plural, one detail line each", () => {
    const other = vocabularyViolation({
      ...VIOLATION,
      identifier: "closeAccountWithOverdraft",
      suggestedIdentifier: "closeOverdraftAccount",
    });

    const summary = formatVocabularySummary(1, [VIOLATION, other]);

    expect(summary).toContain("1 new term harvested, 2 deprecated synonyms in use");
    expect(summary.split("\n")).toHaveLength(3);
  });

  test.each([-1, 1.5])("rejects %p new terms, naming the field", (count) => {
    expect(() => formatVocabularySummary(count, [])).toThrow(
      new RangeError(`newTermCount must be a whole number of at least 0: ${count}`),
    );
  });
});
