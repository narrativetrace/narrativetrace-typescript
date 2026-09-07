// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { expect, test } from "vitest";
import { suggestRename } from "../src/rename-suggester.js";
import { normalizePhrase } from "../src/term-normalizer.js";

/**
 * Token shapes that exercise the case boundaries of the split.
 *
 * @remarks Digits are deliberately absent. A digit is a token boundary that needs no capital
 * letter, so a lowercase token sitting after one loses its boundary when the splice puts letters in
 * front of it — see the known limitation pinned in `rename-suggester.test.ts`.
 */
const TOKENS = ["open", "Account", "WITH", "Overdrafts", "x", "DTO", "id"];

const identifier = fc
  .array(fc.constantFrom(...TOKENS), { minLength: 1, maxLength: 6 })
  .chain((tokens) =>
    fc.constantFrom(tokens.join(""), tokens.join("_"), tokens.join("").toLowerCase()),
  );

function tokensOf(phrase: string): string[] {
  return normalizePhrase(phrase).split(" ");
}

/**
 * The load-bearing invariant of the suggester: the case-preserving token list is index-aligned with
 * the normalized one. When it is not, the splice takes the wrong slice, and the rebuilt identifier
 * gains or loses a token — which is what this property watches for.
 */
test("splicing one token for one token never changes how many tokens an identifier has", () => {
  fc.assert(
    fc.property(identifier, (value) => {
      const tokens = tokensOf(value);
      const alias = tokens[tokens.length - 1] as string;

      const renamed = suggestRename(value, alias, "zzz");

      expect(renamed).toBeDefined();
      expect(tokensOf(renamed as string)).toHaveLength(tokens.length);
      expect(tokensOf(renamed as string)).toContain("zzz");
    }),
    { numRuns: 300 },
  );
});

test("the whole phrase of an identifier always matches it, and renames to the canonical term", () => {
  fc.assert(
    fc.property(identifier, (value) => {
      expect(suggestRename(value, normalizePhrase(value), "overdraft account")).toBeDefined();
    }),
    { numRuns: 300 },
  );
});
