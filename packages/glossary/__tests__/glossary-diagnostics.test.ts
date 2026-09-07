// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { readGlossaryJson } from "../src/glossary-json-reader.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { synonymAlias } from "../src/synonym-alias.js";

/**
 * The diagnostics ARE the feature of a strict reader: a hand-curated glossary fails the load so an
 * author can fix the offending line, which only works when the message names that line's field.
 * These tests pin the wording; the happy-path behaviour lives with each unit.
 */

function document(body: string): string {
  return `{ "schemaVersion": 1, "contexts": { "billing": { "packages": [] } }, "terms": [${body}] }`;
}

const TERM = `{
  "term": "invoice", "context": "billing", "kind": "noun-phrase",
  "status": "harvested", "firstSeen": "2026-08-13"
}`;

/** The valid term with one field replaced or added. */
function term(field: string, value: string): string {
  return TERM.includes(`"${field}"`)
    ? document(TERM.replace(new RegExp(`"${field}": "[^"]*"`), `"${field}": ${value}`))
    : document(TERM.replace('"firstSeen"', `"${field}": ${value}, "firstSeen"`));
}

describe("reader diagnostics name the offending field", () => {
  test("names the context whose body is malformed", () => {
    const inContext = (body: string) =>
      `{ "schemaVersion": 1, "contexts": { "billing": ${body} }, "terms": [] }`;

    expect(() => readGlossaryJson(inContext("7"))).toThrow(
      "context 'billing' must be a JSON object",
    );
    expect(() => readGlossaryJson(inContext('{ "nope": 1 }'))).toThrow(
      "unknown key 'nope' in context 'billing'",
    );
    expect(() => readGlossaryJson(inContext("{}"))).toThrow(
      "missing required key 'packages' in context 'billing'",
    );
    expect(() => readGlossaryJson(inContext('{ "packages": [7] }'))).toThrow(
      "packages element must be a JSON string",
    );
    expect(() => readGlossaryJson(inContext('{ "packages": [], "description": 7 }'))).toThrow(
      "description must be a JSON string",
    );
  });

  test("names the root fields", () => {
    expect(() => readGlossaryJson("7")).toThrow("glossary document root must be a JSON object");
    expect(() => readGlossaryJson('{ "schemaVersion": {}, "contexts": {}, "terms": [] }')).toThrow(
      "schemaVersion must be a JSON integer",
    );
    expect(() => readGlossaryJson('{ "contexts": {}, "terms": [] }')).toThrow(
      "missing required key 'schemaVersion' in glossary",
    );
    expect(() => readGlossaryJson('{ "schemaVersion": 1, "terms": [] }')).toThrow(
      "missing required key 'contexts' in glossary",
    );
    expect(() => readGlossaryJson('{ "schemaVersion": 1, "contexts": {} }')).toThrow(
      "missing required key 'terms' in glossary",
    );
  });

  test("names each malformed term field", () => {
    expect(() => readGlossaryJson(document("7"))).toThrow("term entry must be a JSON object");
    expect(() => readGlossaryJson(term("term", "7"))).toThrow("term must be a JSON string");
    expect(() => readGlossaryJson(term("context", "7"))).toThrow("context must be a JSON string");
    expect(() => readGlossaryJson(term("kind", "7"))).toThrow("kind must be a JSON string");
    expect(() => readGlossaryJson(term("status", "7"))).toThrow("status must be a JSON string");
    expect(() => readGlossaryJson(term("firstSeen", "7"))).toThrow(
      "firstSeen must be a JSON string",
    );
    expect(() => readGlossaryJson(term("definition", "7"))).toThrow(
      "definition must be a JSON string",
    );
  });

  test("names each missing required term field", () => {
    for (const key of ["term", "context", "kind", "status", "firstSeen"]) {
      expect(() => readGlossaryJson(term(key, "null"))).toThrow(
        `missing required key '${key}' in term`,
      );
    }
  });

  test("names the offending locale inside translations", () => {
    expect(() => readGlossaryJson(term("translations", "7"))).toThrow(
      "translations must be a JSON object",
    );
    expect(() => readGlossaryJson(term("translations", '{ "es": 7 }'))).toThrow(
      "translation 'es' must be a JSON string",
    );
  });

  test("names the offending synonym field", () => {
    expect(() => readGlossaryJson(term("synonyms", "7"))).toThrow("synonyms must be a JSON array");
    expect(() => readGlossaryJson(term("synonyms", "[7]"))).toThrow(
      "synonym entry must be a JSON object",
    );
    expect(() => readGlossaryJson(term("synonyms", '[{ "nope": 1 }]'))).toThrow(
      "unknown key 'nope' in synonym",
    );
    expect(() => readGlossaryJson(term("synonyms", "[{}]"))).toThrow(
      "missing required key 'alias' in synonym",
    );
    expect(() => readGlossaryJson(term("synonyms", '[{ "alias": 7 }]'))).toThrow(
      "alias must be a JSON string",
    );
    expect(() => readGlossaryJson(term("synonyms", '[{ "alias": "bill", "note": 7 }]'))).toThrow(
      "note must be a JSON string",
    );
  });

  test("names sources when its elements are wrong", () => {
    expect(() => readGlossaryJson(term("sources", "7"))).toThrow("sources must be a JSON array");
    expect(() => readGlossaryJson(term("sources", "[7]"))).toThrow(
      "sources element must be a JSON string",
    );
  });

  test("reports an unknown enum label with the label that was written", () => {
    expect(() => readGlossaryJson(term("kind", '"phrase"'))).toThrow("unknown term kind 'phrase'");
    expect(() => readGlossaryJson(term("status", '"draft"'))).toThrow(
      "unknown term status 'draft'",
    );
  });
});

describe("model guards name the offending field", () => {
  const valid = {
    term: "invoice",
    context: "billing",
    kind: "noun-phrase",
    status: "harvested",
    firstSeen: "2026-08-13",
  } as const;

  test("names a blank identifying string", () => {
    expect(() => synonymAlias(" ")).toThrow("alias must not be blank");
    expect(() => boundedContext(" ", [])).toThrow("context name must not be blank");
    expect(() => boundedContext("billing", [" "])).toThrow(
      "package prefix of context 'billing' must not be blank",
    );
    expect(() => glossaryTerm({ ...valid, term: " " })).toThrow("term must not be blank");
    expect(() => glossaryTerm({ ...valid, context: " " })).toThrow(
      "term context must not be blank",
    );
    expect(() => glossaryTerm({ ...valid, translations: new Map([[" ", "factura"]]) })).toThrow(
      "translation locale must not be blank",
    );
  });

  test("distinguishes a malformed date from an impossible one", () => {
    expect(() => glossaryTerm({ ...valid, firstSeen: "13-08-2026" })).toThrow(
      "firstSeen must be an ISO date (YYYY-MM-DD): '13-08-2026'",
    );
    expect(() => glossaryTerm({ ...valid, firstSeen: "2026-02-30" })).toThrow(
      "firstSeen is not a real calendar date: '2026-02-30'",
    );
  });

  test("reports an unknown enum label with the label that was written", () => {
    expect(() => glossaryTerm({ ...valid, kind: "phrase" as never })).toThrow(
      "unknown term kind 'phrase'",
    );
    expect(() => glossaryTerm({ ...valid, status: "draft" as never })).toThrow(
      "unknown term status 'draft'",
    );
  });
});
