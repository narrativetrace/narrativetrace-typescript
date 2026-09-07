// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { requireNonBlank } from "./guards.js";
import { normalizePhrase } from "./term-normalizer.js";

/**
 * Case-preserving split on the same boundaries as clarity's identifier tokenizer.
 *
 * INTENT: the suggestion has to put back the identifier's own spelling, and clarity's tokenizer
 * lowercases, so it cannot be reused here. Splitting on identical boundaries is what keeps this
 * token list index-aligned with the normalized one.
 */
function rawTokens(identifier: string): string[] {
  return identifier
    .replace(/_/g, "\0")
    .replace(/([a-zA-Z])(\d)/g, "$1\0$2")
    .replace(/(\d)([a-zA-Z])/g, "$1\0$2")
    .replace(/([a-z])([A-Z])/g, "$1\0$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\0$2")
    .split("\0")
    .filter((token) => token !== "");
}

/**
 * Index where `window` occurs contiguously in `tokens`, or -1.
 *
 * @remarks The bound is an early exit, not a correctness guard — past it every comparison reads an
 * absent token and fails — so mutating it only costs iterations. Same for the `+` in the capture of
 * the acronym rule above: both are equivalent mutants, and no test can kill either.
 */
function windowStart(tokens: readonly string[], window: readonly string[]): number {
  for (let start = 0; start + window.length <= tokens.length; start++) {
    if (window.every((token, offset) => tokens[start + offset] === token)) return start;
  }
  return -1;
}

function cased(token: string, capitalize: boolean): string {
  const lower = token.toLowerCase();
  return capitalize ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
}

/**
 * Joins tokens back into one camel- or PascalCase identifier.
 *
 * @remarks Only the spliced tokens and the first one are re-cased; every other token is emitted
 * with its original spelling, so acronyms like `DTO` survive a rename untouched.
 */
function joinCamel(
  tokens: readonly string[],
  pascal: boolean,
  spliceStart: number,
  spliceLength: number,
): string {
  return tokens
    .map((token, index) => {
      const spliced = index >= spliceStart && index < spliceStart + spliceLength;
      if (!spliced && index > 0) return token;
      return cased(token, index > 0 || pascal);
    })
    .join("");
}

function rebuild(
  identifier: string,
  raw: readonly string[],
  window: { readonly start: number; readonly end: number },
  replacement: readonly string[],
): string {
  const tokens = [...raw.slice(0, window.start), ...replacement, ...raw.slice(window.end)];
  if (identifier.includes("_")) return tokens.map((token) => token.toLowerCase()).join("_");
  return joinCamel(
    tokens,
    identifier.charAt(0) === identifier.charAt(0).toUpperCase(),
    window.start,
    replacement.length,
  );
}

/**
 * Mechanically derives the canonical-term rename of an identifier that uses a deprecated alias.
 *
 * INTENT: a violation that only says "wrong word" costs the reader a rename decision; one that
 * says `openAccountWithOverdraft → openOverdraftAccount` costs an edit. The rule is purely
 * structural — find the alias's token window in the identifier, splice the canonical term's tokens
 * in, and re-join in the identifier's own casing convention.
 *
 * @param identifier the offending identifier, in its original spelling.
 * @param aliasPhrase the normalized alias phrase observed in it.
 * @param canonicalPhrase the normalized canonical term to splice in.
 * @returns the renamed identifier, or `undefined` — never `null` — when the alias's tokens do not
 * appear contiguously, which is when no mechanical rename exists and only a human can choose one.
 * @throws {TypeError} if any argument is blank, or if `identifier` holds no word characters.
 * @remarks Matching runs on normalized tokens, so a plural spelling still matches its singular
 * alias; the tokens outside the window keep their original spelling, and `_` anywhere in the
 * identifier makes the whole result snake_case.
 * @example
 * ```ts
 * suggestRename("openAccountWithOverdraft", "account with overdraft", "overdraft account");
 * // "openOverdraftAccount"
 * ```
 */
export function suggestRename(
  identifier: string,
  aliasPhrase: string,
  canonicalPhrase: string,
): string | undefined {
  requireNonBlank(identifier, "identifier");
  requireNonBlank(aliasPhrase, "alias phrase");
  requireNonBlank(canonicalPhrase, "canonical phrase");
  const alias = aliasPhrase.split(" ");
  const start = windowStart(normalizePhrase(identifier).split(" "), alias);
  if (start < 0) return undefined;
  const window = { start, end: start + alias.length };
  return rebuild(identifier, rawTokens(identifier), window, canonicalPhrase.split(" "));
}
