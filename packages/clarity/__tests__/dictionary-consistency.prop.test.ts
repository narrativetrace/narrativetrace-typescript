// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { allKnownAbbreviations, classifyAbbreviation } from "../src/abbreviation-dictionary.js";
import {
  allCollocationNouns,
  allCollocationPairs,
  isValidCollocation,
} from "../src/collocation-dictionary.js";
import {
  allRoleExpectedVerbs,
  allRoleSuffixes,
  classifyRoleSuffix,
  expectedVerbsForRole,
} from "../src/role-suffix-dictionary.js";
import { classifyVerb } from "../src/verb-dictionary.js";

const NON_VERB_ROLE_TOKENS = new Set(["of", "from", "to", "with", "on", "new"]);
const NON_ACTION_COLLOCATION_VERBS = new Set(["service"]);

const collocationPairs = allCollocationPairs().filter(
  (pair) => !NON_ACTION_COLLOCATION_VERBS.has(pair.verb),
);
const collocationNouns = allCollocationNouns();
const roleSuffixes = allRoleSuffixes();
const roleExpectedVerbs = [...new Set(allRoleExpectedVerbs())].filter(
  (verb) => !NON_VERB_ROLE_TOKENS.has(verb.toLowerCase()),
);
const abbreviations = allKnownAbbreviations();

test("collocation pairs remain preferred", () => {
  fc.assert(
    fc.property(fc.constantFrom(...collocationPairs), ({ verb, noun }) => {
      expect(isValidCollocation(verb, noun)).toBe(true);
    }),
  );
});

test("collocation lookup is case-insensitive", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...collocationPairs),
      fc.boolean(),
      fc.boolean(),
      ({ verb, noun }, upperVerb, upperNoun) => {
        const verbCandidate = upperVerb ? verb.toUpperCase() : verb.toLowerCase();
        const nounCandidate = upperNoun ? noun.toUpperCase() : noun.toLowerCase();
        expect(isValidCollocation(verbCandidate, nounCandidate)).toBe(true);
      },
    ),
  );
});

test("collocation nouns remain present", () => {
  fc.assert(
    fc.property(fc.constantFrom(...collocationNouns), (noun) => {
      expect(collocationNouns).toContain(noun);
    }),
  );
});

test("expected role suffixes remain known and case-insensitive", () => {
  fc.assert(
    fc.property(fc.constantFrom(...roleSuffixes), (suffix) => {
      expect(classifyRoleSuffix(suffix)).not.toBe("unknown");
      expect(expectedVerbsForRole(suffix.toUpperCase())).toStrictEqual(
        expectedVerbsForRole(suffix.toLowerCase()),
      );
    }),
  );
});

test("abbreviations remain case-insensitive", () => {
  fc.assert(
    fc.property(fc.constantFrom(...abbreviations), (abbr) => {
      expect(classifyAbbreviation(abbr.toLowerCase())).toBeDefined();
      expect(classifyAbbreviation(abbr.toUpperCase())).toStrictEqual(
        classifyAbbreviation(abbr.toLowerCase()),
      );
    }),
  );
});

test("collocation verbs are known by verb dictionary", () => {
  const unknown = collocationPairs
    .filter((pair) => classifyVerb(pair.verb) === "unknown")
    .map((pair) => `${pair.noun}:${pair.verb}`);

  expect(unknown).toStrictEqual([]);
});

test("expected role verbs are known by verb dictionary", () => {
  const unknown = roleExpectedVerbs.filter((verb) => classifyVerb(verb) === "unknown");
  expect(unknown).toStrictEqual([]);
});
