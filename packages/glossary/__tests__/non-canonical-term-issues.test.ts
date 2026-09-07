// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { NON_CANONICAL_TERM, nonCanonicalTermIssues } from "../src/non-canonical-term-issues.js";
import { vocabularyViolation } from "../src/vocabulary-violation.js";

const VIOLATION = vocabularyViolation({
  context: "billing",
  alias: "account with overdraft",
  canonicalTerm: "overdraft account",
  site: "OverdraftService.openAccountWithOverdraft",
  identifier: "openAccountWithOverdraft",
  suggestedIdentifier: "openOverdraftAccount",
  occurrences: 3,
});

describe("nonCanonicalTermIssues", () => {
  test("uses the category name clarity reports and gates already know", () => {
    expect(NON_CANONICAL_TERM).toBe("non-canonical-term");
  });

  test("reports a violation as a clarity issue against its code site", () => {
    expect(nonCanonicalTermIssues([VIOLATION])).toStrictEqual([
      {
        category: NON_CANONICAL_TERM,
        element: "billing.OverdraftService.openAccountWithOverdraft",
        suggestion: "use canonical term 'overdraft account' → rename to openOverdraftAccount",
        severity: "MEDIUM",
        occurrences: 3,
        impactScore: 6,
      },
    ]);
  });

  test("suggests only the canonical term when no rename could be derived", () => {
    const { suggestedIdentifier: _none, ...unrenameable } = VIOLATION;

    expect(nonCanonicalTermIssues([vocabularyViolation(unrenameable)])[0]?.suggestion).toBe(
      "use canonical term 'overdraft account'",
    );
  });

  test("keeps the order it was given, so the report matches the summary", () => {
    const other = vocabularyViolation({ ...VIOLATION, site: "A.a", occurrences: 1 });

    expect(nonCanonicalTermIssues([other, VIOLATION]).map((issue) => issue.element)).toStrictEqual([
      "billing.A.a",
      "billing.OverdraftService.openAccountWithOverdraft",
    ]);
  });

  test("reports nothing when the vocabulary was respected", () => {
    expect(nonCanonicalTermIssues([])).toStrictEqual([]);
  });
});
