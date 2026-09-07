// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { vocabularyViolation } from "../src/vocabulary-violation.js";

const VIOLATION = {
  context: "billing",
  alias: "account with overdraft",
  canonicalTerm: "overdraft account",
  site: "OverdraftService.openAccountWithOverdraft",
  identifier: "openAccountWithOverdraft",
  suggestedIdentifier: "openOverdraftAccount",
  occurrences: 2,
} as const;

describe("vocabularyViolation", () => {
  test("carries the offending use and the canonical term to use instead", () => {
    expect(vocabularyViolation(VIOLATION)).toStrictEqual(VIOLATION);
  });

  test("omits the suggestion when no mechanical rename exists", () => {
    const { suggestedIdentifier: _dropped, ...withoutSuggestion } = VIOLATION;

    expect(vocabularyViolation(withoutSuggestion)).not.toHaveProperty("suggestedIdentifier");
  });

  test("freezes the record", () => {
    expect(Object.isFrozen(vocabularyViolation(VIOLATION))).toBe(true);
  });

  test.each([
    "context",
    "alias",
    "canonicalTerm",
    "site",
    "identifier",
  ] as const)("rejects a blank %s", (field) => {
    expect(() => vocabularyViolation({ ...VIOLATION, [field]: " " })).toThrow(
      new TypeError(`${field === "context" ? "violation context" : field} must not be blank`),
    );
  });

  test("rejects a blank suggestion, which would read as a rename to nothing", () => {
    expect(() => vocabularyViolation({ ...VIOLATION, suggestedIdentifier: "" })).toThrow(
      new TypeError("suggestedIdentifier must not be blank"),
    );
  });

  test.each([0, -1, 1.5])("rejects %p occurrences, naming the field", (occurrences) => {
    expect(() => vocabularyViolation({ ...VIOLATION, occurrences })).toThrow(
      new RangeError(`occurrences must be a whole number of at least 1: ${occurrences}`),
    );
  });
});
