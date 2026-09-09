// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type BoundedContext, boundedContext } from "./bounded-context.js";
import { type Glossary, glossary } from "./glossary.js";
import { type GlossaryTerm, glossaryTerm } from "./glossary-term.js";
import {
  asArray,
  asInteger,
  asObject,
  asString,
  asStringArray,
  type JsonObject,
  optionalString,
  rejectExcessiveNesting,
  rejectUnknownKeys,
  required,
} from "./json-shape.js";
import { type SynonymAlias, synonymAlias } from "./synonym-alias.js";
import { requireTermKind, type TermKind } from "./term-kind.js";
import { isTermStatus, type TermStatus } from "./term-status.js";

/**
 * Ceiling on `glossary.json`'s own JSON object/array nesting, checked directly on the value
 * `JSON.parse` produced — before any field is narrowed to its schema type.
 *
 * @remarks The family-wide constant (owner ruling, 2026-09-08): every port converges on 16,
 * independent of how each one's JSON reader is built. The hand-curated shape this schema actually
 * uses never legitimately nests past a handful of levels (contexts → terms → translations/synonyms
 * tops out around 4), so 16 is headroom, not a realistic ceiling — its job is to turn a
 * pathologically deep document (hostile, or simply corrupted) into one clean, named error instead
 * of an unbounded validation walk.
 */
const MAX_GLOSSARY_NESTING_DEPTH = 16;

const ROOT_KEYS = ["schemaVersion", "contexts", "abbreviations", "terms"] as const;
const CONTEXT_KEYS = ["packages", "description"] as const;
const TERM_KEYS = [
  "term",
  "context",
  "kind",
  "status",
  "definition",
  "translations",
  "synonyms",
  "sources",
  "firstSeen",
] as const;
const SYNONYM_KEYS = ["alias", "note"] as const;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`glossary is not valid JSON: ${(cause as Error).message}`, { cause });
  }
}

function readContexts(raw: JsonObject): Map<string, BoundedContext> {
  const contexts = new Map<string, BoundedContext>();
  for (const [name, value] of raw) {
    const body = asObject(value, `context '${name}'`);
    rejectUnknownKeys(body, CONTEXT_KEYS, `context '${name}'`);
    const packages = asStringArray(required(body, "packages", `context '${name}'`), "packages");
    contexts.set(name, boundedContext(name, packages, optionalString(body, "description")));
  }
  return contexts;
}

/**
 * Reads the optional `abbreviations` section.
 *
 * @remarks Accepted at any schema version at or above 1. The section is additive and harmless, so
 * refusing it on a `1`-stamped file would buy nothing and create a migration cliff — a port that
 * has not yet stamped 2 must still be able to read a file that has.
 */
function readAbbreviations(root: JsonObject): Map<string, string> {
  if (!root.has("abbreviations")) return new Map();
  const raw = asObject(root.get("abbreviations"), "abbreviations");
  return new Map(
    [...raw].map(([abbreviation, expansion]) => [
      abbreviation,
      asString(expansion, `abbreviation '${abbreviation}'`),
    ]),
  );
}

function readKind(value: unknown): TermKind {
  return requireTermKind(asString(value, "kind"));
}

function readStatus(value: unknown): TermStatus {
  const label = asString(value, "status");
  if (!isTermStatus(label)) throw new TypeError(`unknown term status '${label}'`);
  return label;
}

function readTranslations(body: JsonObject): Map<string, string> {
  if (!body.has("translations")) return new Map();
  const raw = asObject(body.get("translations"), "translations");
  return new Map(
    [...raw].map(([locale, text]) => [locale, asString(text, `translation '${locale}'`)]),
  );
}

function readSynonym(element: unknown): SynonymAlias {
  const body = asObject(element, "synonym entry");
  rejectUnknownKeys(body, SYNONYM_KEYS, "synonym");
  return synonymAlias(
    asString(required(body, "alias", "synonym"), "alias"),
    optionalString(body, "note"),
  );
}

function readSynonyms(body: JsonObject): SynonymAlias[] {
  if (!body.has("synonyms")) return [];
  return asArray(body.get("synonyms"), "synonyms").map(readSynonym);
}

function readTerm(element: unknown): GlossaryTerm {
  const body = asObject(element, "term entry");
  rejectUnknownKeys(body, TERM_KEYS, "term");
  return glossaryTerm({
    term: asString(required(body, "term", "term"), "term"),
    context: asString(required(body, "context", "term"), "context"),
    kind: readKind(required(body, "kind", "term")),
    status: readStatus(required(body, "status", "term")),
    definition: optionalString(body, "definition"),
    translations: readTranslations(body),
    synonyms: readSynonyms(body),
    sources: body.has("sources") ? asStringArray(body.get("sources"), "sources") : [],
    firstSeen: asString(required(body, "firstSeen", "term"), "firstSeen"),
  });
}

/**
 * Parses `glossary.json` text into a validated {@link Glossary}.
 *
 * INTENT: the committed glossary is hand-curated, so this reader is deliberately strict — an
 * unknown key, a bad enum label, a `null` standing in for an absent field, or a malformed date
 * fails the load rather than being silently dropped on the next write. Validation runs before any
 * model is built, and the model's own constructors enforce the structural invariants on top.
 *
 * @param text a complete `glossary.json` document.
 * @returns the parsed glossary, with terms in canonical `(context, term)` order.
 * @throws {Error} if `text` is not valid JSON, with the parser's message and `cause` attached.
 * @throws {TypeError} on an unknown or missing key, a field of the wrong JSON type, an unknown
 * `kind`/`status` label, or a violated structural invariant (duplicate term identity, undeclared
 * context, alias colliding with a canonical term).
 * @throws {RangeError} if `schemaVersion` is below 1, a `firstSeen` is not a real calendar date, or
 * the document nests deeper than {@link MAX_GLOSSARY_NESTING_DEPTH} object/array levels.
 * @remarks A schema version above the current one is accepted rather than refused, matching the
 * Java reference; the unknown-key rule is what actually stops a newer file from being misread,
 * since any field added by a later schema fails the load. The nesting check runs first, on the raw
 * parsed value — before the document is even confirmed to be an object — since `JSON.parse` has
 * already paid the cost of materializing it however deep it goes; nothing downstream should have
 * to walk that deep a structure just to reject it.
 * @example
 * ```ts
 * const model = readGlossaryJson(readFileSync("glossary.json", "utf-8"));
 * ```
 */
export function readGlossaryJson(text: string): Glossary {
  const parsed = parseJson(text);
  rejectExcessiveNesting(parsed, MAX_GLOSSARY_NESTING_DEPTH, "glossary document");
  const root = asObject(parsed, "glossary document root");
  rejectUnknownKeys(root, ROOT_KEYS, "glossary");
  return glossary(
    asInteger(required(root, "schemaVersion", "glossary"), "schemaVersion"),
    readContexts(asObject(required(root, "contexts", "glossary"), "contexts")),
    asArray(required(root, "terms", "glossary"), "terms").map(readTerm),
    readAbbreviations(root),
  );
}
