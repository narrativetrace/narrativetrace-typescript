// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { expect, test } from "vitest";
import { methodCandidates, normalizePhrase } from "../src/term-normalizer.js";

/** Word tokens a real identifier is built from. */
const word = fc.stringMatching(/^[a-z]{2,10}$/);
const words = fc.array(word, { minLength: 1, maxLength: 5 });

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

test("every spelling of one identifier converges on the same phrase", () => {
  fc.assert(
    fc.property(words, (tokens) => {
      const camel = tokens[0] + tokens.slice(1).map(capitalize).join("");
      const pascal = tokens.map(capitalize).join("");
      const snake = tokens.join("_");
      const screaming = tokens.join("_").toUpperCase();

      const phrase = normalizePhrase(camel);

      expect(normalizePhrase(pascal)).toBe(phrase);
      expect(normalizePhrase(snake)).toBe(phrase);
      expect(normalizePhrase(screaming)).toBe(phrase);
    }),
    { numRuns: 300 },
  );
});

test("normalizing the same identifier twice gives the same phrase", () => {
  fc.assert(
    fc.property(words, (tokens) => {
      const identifier = tokens.join("_");

      expect(normalizePhrase(identifier)).toBe(normalizePhrase(identifier));
    }),
    { numRuns: 300 },
  );
});

test("a normalized phrase is always lowercase, single-spaced and non-blank", () => {
  fc.assert(
    fc.property(words, (tokens) => {
      const phrase = normalizePhrase(tokens.join("_"));

      expect(phrase).toBe(phrase.toLowerCase());
      expect(phrase.trim()).toBe(phrase);
      expect(phrase).not.toBe("");
      expect(phrase).not.toMatch(/ {2}/);
    }),
    { numRuns: 300 },
  );
});

/**
 * Tokens biased toward every shape the singularizer branches on. A uniformly random `[a-z]{1,12}`
 * string almost never ends in `ses`/`ies`, so it would not exercise the rules that decide whether
 * a trailing `s` is a plural — the class of defect this property exists to catch.
 */
const singularizerToken = fc.oneof(
  fc
    .tuple(
      fc.stringMatching(/^[a-z]{1,8}$/),
      fc.constantFrom("", "s", "es", "ses", "ies", "us", "is", "ss", "ches", "shes", "xes", "zes"),
    )
    .map(([stem, ending]) => stem + ending),
  fc.constantFrom("alias", "gas", "series", "status", "bus", "lens", "always", "case", "clause"),
);

test("normalizing a normalized phrase changes nothing", () => {
  fc.assert(
    fc.property(fc.array(singularizerToken, { minLength: 1, maxLength: 4 }), (tokens) => {
      const identifier = tokens.join("_");
      const once = normalizePhrase(identifier);

      // Feeding a phrase back in is not how the harvest path uses it, but a rule that strips a
      // second time is a rule that strips a real word the first time — the underlying defect.
      expect(normalizePhrase(once.replace(/ /g, "_"))).toBe(once);
    }),
    { numRuns: 500 },
  );
});

test("method candidates never lose the object phrase from the verb phrase", () => {
  fc.assert(
    fc.property(words, (tokens) => {
      const candidates = methodCandidates(tokens.join("_"));

      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(candidates[0]?.phrase.includes(candidate.phrase)).toBe(true);
      }
    }),
    { numRuns: 300 },
  );
});
