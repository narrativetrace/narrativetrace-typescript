// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { harvestCandidate } from "../src/harvest-candidate.js";

/** The fields of a valid observation, so each test can vary exactly one of them. */
const OBSERVATION = {
  context: "billing",
  phrase: "overdraft account",
  kind: "noun-phrase",
  site: "OverdraftService.openOverdraftAccount",
  identifier: "openOverdraftAccount",
  occurrences: 1,
} as const;

describe("harvestCandidate", () => {
  test("carries the observation's fields", () => {
    const candidate = harvestCandidate(OBSERVATION);

    expect(candidate).toStrictEqual({
      context: "billing",
      phrase: "overdraft account",
      kind: "noun-phrase",
      site: "OverdraftService.openOverdraftAccount",
      identifier: "openOverdraftAccount",
      occurrences: 1,
    });
  });

  test("freezes the record", () => {
    expect(Object.isFrozen(harvestCandidate(OBSERVATION))).toBe(true);
  });

  test.each([
    "context",
    "phrase",
    "site",
    "identifier",
  ] as const)("rejects a blank %s, naming the field", (field) => {
    expect(() => harvestCandidate({ ...OBSERVATION, [field]: "   " })).toThrow(
      new TypeError(`${field === "context" ? "candidate context" : field} must not be blank`),
    );
  });

  test("rejects a kind outside the taxonomy", () => {
    expect(() => harvestCandidate({ ...OBSERVATION, kind: "sentence" as never })).toThrow(
      new TypeError("unknown term kind 'sentence'"),
    );
  });

  test.each([0, -1])("rejects %i occurrences — an observation was observed", (occurrences) => {
    expect(() => harvestCandidate({ ...OBSERVATION, occurrences })).toThrow(
      new RangeError(`occurrences must be a whole number of at least 1: ${occurrences}`),
    );
  });

  test("rejects a fractional occurrence count", () => {
    expect(() => harvestCandidate({ ...OBSERVATION, occurrences: 1.5 })).toThrow(RangeError);
  });
});
