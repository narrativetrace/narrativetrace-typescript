// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  analyzeMorphology,
  classifyRoleSuffix,
  classifyVerb,
  tokenize,
} from "@narrativetrace/clarity";
import { requireNonBlank } from "./guards.js";
import type { TermKind } from "./term-kind.js";

/** Function words that must survive normalization untouched, and never be singularized. */
const STOPWORDS = new Set([
  "with",
  "and",
  "or",
  "of",
  "to",
  "for",
  "by",
  "from",
  "in",
  "on",
  "at",
  "as",
  "was",
  "is",
  "has",
]);

/** Trailing patterns whose `es` marks a plural (`boxes`, `classes`), not a stem ending in `e`. */
const ES_PLURAL_ENDINGS = ["ses", "xes", "zes", "ches", "shes"];

/**
 * Words ending in `s` that are singular (`alias`, `gas`, Latin `-us` nouns), invariant plurals
 * (`series`, `species`), or not nouns at all (`always`) — never stripped.
 *
 * @remarks Also the only way an `s`-final `-es` stem is accepted (`gases` → "gas", `statuses` →
 * "status"); an unlisted `s`-final stem means the plural was built as `-se` + `s` (`clauses` →
 * "clause"). Shared verbatim with the Java runtime's `S_FINAL_SINGULARS`, because a normalized
 * phrase is term identity in a committed glossary — a list that differed per port would split the
 * vocabulary of one repository.
 * @remarks Exported for the test that walks it: the list is data, and a word added to it without
 * a test would otherwise be an untested branch of the singularizer.
 */
export const S_FINAL_SINGULARS = new Set([
  "alias",
  "always",
  "atlas",
  "bias",
  "bonus",
  "bus",
  "campus",
  "canvas",
  "census",
  "chaos",
  "corpus",
  "focus",
  "gas",
  "lens",
  "locus",
  "news",
  "radius",
  "series",
  "species",
  "status",
  "surplus",
  "virus",
]);

/** Type-name suffixes stripped when harvesting failure vocabulary. */
const EXCEPTION_SUFFIXES = new Set(["exception", "error"]);

/** The role token stripped from a parameter name (`overdraftAccountId` → "overdraft account"). */
const PARAMETER_ROLE = "id";

/**
 * One harvestable phrase produced by normalization.
 *
 * INTENT: pairs the text a term would carry with the grammatical shape derived from the
 * identifier's structure, so the harvester never has to re-inspect the identifier.
 *
 * @remarks The Java reference calls this `TermNormalizer.Candidate`; the name is spelled out here
 * because this package has no nested types. Distinct from `HarvestCandidate`, which is this phrase
 * *plus* where it was observed.
 */
export interface TermCandidate {
  /** Normalized phrase text: lowercase, space-separated, plural nouns singularized. */
  readonly phrase: string;
  /** Grammatical shape derived from structure — a leading verb, and the token count. */
  readonly kind: TermKind;
}

/** Words ending in ss/us/is are not English plurals (`status`, `analysis`, `progress`). */
function keepsTrailingS(token: string): boolean {
  return token.endsWith("ss") || token.endsWith("us") || token.endsWith("is");
}

/**
 * Whether a stem is an acceptable singular — true iff {@link singularize} would leave it alone.
 *
 * @remarks Stricter than {@link keepsTrailingS} on purpose: a `us`/`is` ending does not bless a
 * stem, because there those endings usually mean the plural was `-se` + `s` (`clauses` → "claus",
 * `promises` → "promis"), so only `ss` stems and listed words qualify.
 */
function isStableSingular(stem: string): boolean {
  return !stem.endsWith("s") || stem.endsWith("ss") || S_FINAL_SINGULARS.has(stem);
}

/** A deliberately small English heuristic — the glossary is reviewed by humans, not a linguist. */
function singularize(token: string): string {
  if (S_FINAL_SINGULARS.has(token)) return token;
  if (token.endsWith("ies") && token.length > 3) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && ES_PLURAL_ENDINGS.some((ending) => token.endsWith(ending))) {
    const stem = token.slice(0, -2);
    if (isStableSingular(stem)) return stem;
    // An unstable `ses` stem means the plural was built as `-se` + `s` ("cases", "responses"):
    // fall through to the single-s rule so the e survives.
  }
  if (token.endsWith("s") && token.length > 1 && !keepsTrailingS(token)) return token.slice(0, -1);
  return token;
}

/**
 * Whether a token reads as a verb.
 *
 * @remarks Divergence from the Java runtime, which asks only its suffix-based morphology
 * analyzer. This runtime's clarity module keeps verb knowledge in a curated dictionary
 * (`classifyVerb`) and leaves `analyzeMorphology` a thin suffix heuristic, so both are consulted:
 * the dictionary recognizes `open`/`charge`/`check`, the suffixes recognize `normalize`/`notify`.
 * Consulting only one would misread most real method names.
 */
function isVerb(token: string): boolean {
  return classifyVerb(token) !== "unknown" || analyzeMorphology(token) === "verb";
}

function normalizeToken(token: string): string {
  return STOPWORDS.has(token) || isVerb(token) ? token : singularize(token);
}

/** At least one letter or digit — punctuation alone names no concept. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function normalizedTokens(identifier: string, what: string): string[] {
  requireNonBlank(identifier, what);
  const tokens = tokenize(identifier).map(normalizeToken);
  // The join separator is equivalent to any other: the tokenizer never returns more than one
  // token for an identifier made only of punctuation, so no separator is ever inserted here.
  if (!WORD_CHARACTER.test(tokens.join(""))) {
    throw new TypeError(`${what} holds no word characters: '${identifier}'`);
  }
  return tokens;
}

function nounCandidate(tokens: readonly string[]): TermCandidate {
  return { phrase: tokens.join(" "), kind: tokens.length === 1 ? "word" : "noun-phrase" };
}

function withoutLeadingStopwords(tokens: readonly string[]): readonly string[] {
  let start = 0;
  // The bound is equivalent to `<=` and to no bound at all: one past the end reads `undefined`,
  // which is in no stopword set, so the second test stops the loop either way. Two unkillable
  // mutants live here by construction — they are not a test gap.
  while (start < tokens.length && STOPWORDS.has(tokens[start] as string)) start++;
  return tokens.slice(start);
}

/**
 * Normalizes one identifier to glossary phrase form: lowercase, space-separated, plural nouns
 * singularized.
 *
 * INTENT: every spelling of one concept must converge on a single phrase — `accountWithOverdraft`,
 * `AccountWithOverdraft` and `account_with_overdraft` all become "account with overdraft" —
 * because term and alias matching only ever happens on the normalized form.
 *
 * @param identifier a camelCase, PascalCase or snake_case identifier.
 * @returns the normalized phrase; never blank.
 * @throws {TypeError} if `identifier` is blank, or holds no word characters to tokenize (`___`).
 * @llmNote Singularization is a deliberately small English heuristic, shared rule-for-rule with the
 * Java reference because a normalized phrase is term identity in a committed glossary: a keep-list
 * of `s`-final singulars and invariant plurals (`alias`, `gas`, `series`), a `y`-stem rule
 * (`entries` → "entry"), and an `-es` rule that only strips when the stem it leaves is itself a
 * singular (`gases` → "gas", but `clauses` → "clause", not "claus"). It is idempotent — feeding a
 * phrase back in returns it unchanged — though the harvest path never does so.
 * @example
 * ```ts
 * normalizePhrase("openAccountWithOverdraft"); // "open account with overdraft"
 * ```
 */
export function normalizePhrase(identifier: string): string {
  return normalizedTokens(identifier, "identifier").join(" ");
}

/**
 * Normalizes a method name into the phrases worth harvesting from it.
 *
 * INTENT: a method is where a domain action is named, so a verb method contributes two terms — the
 * action itself and the thing it acts on. Splitting them is what lets "account with overdraft" be
 * governed as vocabulary independently of the verbs that touch it.
 *
 * @param methodName the method identifier.
 * @returns one or two candidates, never empty: a verb-leading name yields its verb phrase plus the
 * object noun phrase (leading function words dropped, and the object omitted when nothing but
 * function words remain); any other name yields a single noun candidate.
 * @throws {TypeError} if `methodName` is blank or holds no word characters.
 * @example
 * ```ts
 * methodCandidates("openAccountWithOverdraft");
 * // [{ phrase: "open account with overdraft", kind: "verb-phrase" },
 * //  { phrase: "account with overdraft", kind: "noun-phrase" }]
 * ```
 */
export function methodCandidates(methodName: string): TermCandidate[] {
  const tokens = normalizedTokens(methodName, "method name");
  if (!isVerb(tokens[0] as string)) return [nounCandidate(tokens)];
  const candidates: TermCandidate[] = [{ phrase: tokens.join(" "), kind: "verb-phrase" }];
  const object = withoutLeadingStopwords(tokens.slice(1));
  if (object.length > 0) candidates.push(nounCandidate(object));
  return candidates;
}

/** Drops a trailing role token, then makes a noun candidate of whatever is left. */
function strippedCandidate(
  identifier: string,
  what: string,
  isRole: (token: string) => boolean,
): TermCandidate | undefined {
  const tokens = normalizedTokens(identifier, what);
  const stripped = isRole(tokens[tokens.length - 1] as string) ? tokens.slice(0, -1) : tokens;
  return stripped.length === 0 ? undefined : nounCandidate(stripped);
}

/**
 * Normalizes a parameter name into a noun candidate, dropping the trailing `id` role token.
 *
 * @param parameterName the parameter identifier.
 * @returns the candidate, or `undefined` — never `null` — when only the role token was there
 * (`id`, `ids`), which names no domain concept.
 * @throws {TypeError} if `parameterName` is blank or holds no word characters.
 * @example
 * ```ts
 * parameterCandidate("overdraftAccountId"); // { phrase: "overdraft account", kind: "noun-phrase" }
 * ```
 */
export function parameterCandidate(parameterName: string): TermCandidate | undefined {
  return strippedCandidate(parameterName, "parameter name", (token) => token === PARAMETER_ROLE);
}

/**
 * Normalizes a class name into a noun candidate, dropping a recognized role suffix.
 *
 * @param className the simple class name, without any module path.
 * @returns the candidate, or `undefined` when only the role suffix was there (`Service`).
 * @throws {TypeError} if `className` is blank or holds no word characters.
 * @remarks Role suffixes come from clarity's dictionary, so `OverdraftService` contributes
 * "overdraft" while `InvoiceLineItem` keeps its whole phrase — `item` names a domain thing.
 * @example
 * ```ts
 * classCandidate("OverdraftService"); // { phrase: "overdraft", kind: "word" }
 * ```
 */
export function classCandidate(className: string): TermCandidate | undefined {
  return strippedCandidate(
    className,
    "class name",
    (token) => classifyRoleSuffix(token) !== "unknown",
  );
}

/**
 * Normalizes an exception type name into a noun candidate, dropping the `Exception`/`Error` suffix.
 *
 * INTENT: failure vocabulary is domain vocabulary — `InsufficientFundsException` is where a
 * codebase names the concept "insufficient fund", and support engineers read it constantly.
 *
 * @param exceptionTypeName the simple type name, without any module path.
 * @returns the candidate, or `undefined` when only the suffix was there (`Exception`).
 * @throws {TypeError} if `exceptionTypeName` is blank or holds no word characters.
 * @example
 * ```ts
 * exceptionCandidate("InsufficientFundsException");
 * // { phrase: "insufficient fund", kind: "noun-phrase" }
 * ```
 */
export function exceptionCandidate(exceptionTypeName: string): TermCandidate | undefined {
  return strippedCandidate(exceptionTypeName, "exception type name", (token) =>
    EXCEPTION_SUFFIXES.has(token),
  );
}
