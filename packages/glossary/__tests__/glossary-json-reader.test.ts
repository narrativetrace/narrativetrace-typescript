// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { readGlossaryJson } from "../src/glossary-json-reader.js";

const MINIMAL = `{
  "schemaVersion": 1,
  "contexts": { "billing": { "packages": ["packages/billing"] } },
  "terms": [
    {
      "term": "invoice",
      "context": "billing",
      "kind": "noun-phrase",
      "status": "harvested",
      "firstSeen": "2026-08-13"
    }
  ]
}
`;

/** The minimal document with one extra field spliced into its single term. */
function withTermField(jsonField: string): string {
  return MINIMAL.replace('"firstSeen": "2026-08-13"', `"firstSeen": "2026-08-13", ${jsonField}`);
}

describe("readGlossaryJson", () => {
  test("reads a minimal harvested glossary", () => {
    const model = readGlossaryJson(MINIMAL);

    expect(model.schemaVersion).toBe(1);
    expect(model.contexts.get("billing")?.packages).toStrictEqual(["packages/billing"]);
    expect(model.terms).toHaveLength(1);
    expect(model.terms[0]?.term).toBe("invoice");
    expect(model.terms[0]?.kind).toBe("noun-phrase");
    expect(model.terms[0]?.status).toBe("harvested");
    expect(model.terms[0]?.firstSeen).toBe("2026-08-13");
  });

  test("reads every curated field of a fully populated term", () => {
    const model = readGlossaryJson(`{
      "schemaVersion": 1,
      "contexts": {
        "billing": { "packages": ["packages/billing"], "description": "Charging" }
      },
      "terms": [
        {
          "term": "overdraft account",
          "context": "billing",
          "kind": "noun-phrase",
          "status": "curated",
          "definition": "Account permitted to go below zero.",
          "translations": { "es": "cuenta con descubierto", "de": "Dispokonto" },
          "synonyms": [
            { "alias": "account with overdraft", "note": "legacy v1 API phrasing" },
            { "alias": "overdraft-enabled account" }
          ],
          "sources": ["billing.OverdraftService.open"],
          "firstSeen": "2026-08-13"
        }
      ]
    }`);
    const term = model.terms[0];

    expect(model.contexts.get("billing")?.description).toBe("Charging");
    expect(term?.definition).toBe("Account permitted to go below zero.");
    expect(term?.translations.get("es")).toBe("cuenta con descubierto");
    expect(term?.translations.get("de")).toBe("Dispokonto");
    expect(term?.synonyms.map((s) => s.alias)).toStrictEqual([
      "account with overdraft",
      "overdraft-enabled account",
    ]);
    expect(term?.synonyms[0]?.note).toBe("legacy v1 API phrasing");
    expect(term?.synonyms[1]?.note).toBeUndefined();
    expect(term?.sources).toStrictEqual(["billing.OverdraftService.open"]);
  });

  test("reads a glossary with no contexts and no terms", () => {
    const model = readGlossaryJson('{ "schemaVersion": 1, "contexts": {}, "terms": [] }');

    expect(model.contexts.size).toBe(0);
    expect(model.terms).toStrictEqual([]);
  });

  test("rejects text that is not JSON at all", () => {
    expect(() => readGlossaryJson("not json")).toThrow(/not valid JSON/i);
    expect(() => readGlossaryJson("")).toThrow(/not valid JSON/i);
    expect(() => readGlossaryJson('{ "schemaVersion": 1, }')).toThrow(/not valid JSON/i);
  });

  test("rejects a document root that is not an object", () => {
    expect(() => readGlossaryJson("[]")).toThrow(TypeError);
    expect(() => readGlossaryJson('"a string"')).toThrow(TypeError);
    expect(() => readGlossaryJson("null")).toThrow(TypeError);
    expect(() => readGlossaryJson("42")).toThrow(TypeError);
  });

  test("rejects an unknown key at the document root, which is always a typo", () => {
    expect(() =>
      readGlossaryJson('{ "schemaVersion": 1, "contexts": {}, "terms": [], "context": {} }'),
    ).toThrow(/unknown key 'context'/);
  });

  test("rejects a missing required root key", () => {
    expect(() => readGlossaryJson('{ "contexts": {}, "terms": [] }')).toThrow(/schemaVersion/);
    expect(() => readGlossaryJson('{ "schemaVersion": 1, "terms": [] }')).toThrow(/contexts/);
    expect(() => readGlossaryJson('{ "schemaVersion": 1, "contexts": {} }')).toThrow(/terms/);
  });

  test("rejects a schema version that is not a whole number", () => {
    expect(() => readGlossaryJson('{ "schemaVersion": "1", "contexts": {}, "terms": [] }')).toThrow(
      TypeError,
    );
    expect(() => readGlossaryJson('{ "schemaVersion": 1.5, "contexts": {}, "terms": [] }')).toThrow(
      TypeError,
    );
    expect(() => readGlossaryJson('{ "schemaVersion": 0, "contexts": {}, "terms": [] }')).toThrow(
      RangeError,
    );
  });

  test("rejects contexts or terms of the wrong JSON type", () => {
    expect(() => readGlossaryJson('{ "schemaVersion": 1, "contexts": [], "terms": [] }')).toThrow(
      /contexts must be a JSON object/,
    );
    expect(() => readGlossaryJson('{ "schemaVersion": 1, "contexts": {}, "terms": {} }')).toThrow(
      /terms must be a JSON array/,
    );
  });

  test("rejects a malformed context body", () => {
    const document = (body: string) =>
      `{ "schemaVersion": 1, "contexts": { "billing": ${body} }, "terms": [] }`;

    expect(() => readGlossaryJson(document('"packages/billing"'))).toThrow(/must be a JSON object/);
    expect(() => readGlossaryJson(document('{ "packages": [], "extra": 1 }'))).toThrow(
      /unknown key 'extra'/,
    );
    expect(() => readGlossaryJson(document("{}"))).toThrow(/packages/);
    expect(() => readGlossaryJson(document('{ "packages": "packages/billing" }'))).toThrow(
      /must be a JSON array/,
    );
    expect(() => readGlossaryJson(document('{ "packages": [1] }'))).toThrow(
      /must be a JSON string/,
    );
    expect(() => readGlossaryJson(document('{ "packages": [], "description": 7 }'))).toThrow(
      /must be a JSON string/,
    );
  });

  test("rejects a term entry that is not an object", () => {
    expect(() =>
      readGlossaryJson('{ "schemaVersion": 1, "contexts": {}, "terms": ["invoice"] }'),
    ).toThrow(/must be a JSON object/);
  });

  test("rejects an unknown key inside a term", () => {
    expect(() => readGlossaryJson(withTermField('"occurrences": 12'))).toThrow(
      /unknown key 'occurrences'/,
    );
  });

  test("rejects a term missing any required key, naming the key", () => {
    const complete: Record<string, unknown> = {
      term: "invoice",
      context: "billing",
      kind: "noun-phrase",
      status: "harvested",
      firstSeen: "2026-08-13",
    };

    for (const key of Object.keys(complete)) {
      const term = { ...complete };
      delete term[key];
      const document = JSON.stringify({
        schemaVersion: 1,
        contexts: { billing: { packages: [] } },
        terms: [term],
      });

      expect(() => readGlossaryJson(document)).toThrow(`missing required key '${key}' in term`);
    }
  });

  test("rejects a required term key present but set to null", () => {
    expect(() => readGlossaryJson(MINIMAL.replace('"invoice"', "null"))).toThrow(
      /missing required key 'term'/,
    );
  });

  test("rejects a kind or status label outside the taxonomy", () => {
    expect(() => readGlossaryJson(MINIMAL.replace('"noun-phrase"', '"phrase"'))).toThrow(
      /unknown term kind 'phrase'/,
    );
    expect(() => readGlossaryJson(MINIMAL.replace('"harvested"', '"reviewed"'))).toThrow(
      /unknown term status 'reviewed'/,
    );
  });

  test("rejects a kind or status that is not even a string", () => {
    expect(() => readGlossaryJson(MINIMAL.replace('"noun-phrase"', "3"))).toThrow(TypeError);
    expect(() => readGlossaryJson(MINIMAL.replace('"harvested"', "null"))).toThrow(TypeError);
  });

  test("rejects a firstSeen that is not a real ISO calendar date", () => {
    expect(() => readGlossaryJson(MINIMAL.replace("2026-08-13", "13/08/2026"))).toThrow(RangeError);
    expect(() => readGlossaryJson(MINIMAL.replace("2026-08-13", "2026-02-30"))).toThrow(RangeError);
  });

  test("rejects malformed translations", () => {
    expect(() => readGlossaryJson(withTermField('"translations": []'))).toThrow(
      /must be a JSON object/,
    );
    expect(() => readGlossaryJson(withTermField('"translations": { "es": 7 }'))).toThrow(
      /must be a JSON string/,
    );
  });

  test("rejects malformed synonyms", () => {
    expect(() => readGlossaryJson(withTermField('"synonyms": {}'))).toThrow(/must be a JSON array/);
    expect(() => readGlossaryJson(withTermField('"synonyms": ["bill"]'))).toThrow(
      /must be a JSON object/,
    );
    expect(() =>
      readGlossaryJson(withTermField('"synonyms": [{ "alias": "bill", "why": "x" }]')),
    ).toThrow(/unknown key 'why'/);
    expect(() => readGlossaryJson(withTermField('"synonyms": [{ "note": "orphan" }]'))).toThrow(
      /alias/,
    );
    expect(() =>
      readGlossaryJson(withTermField('"synonyms": [{ "alias": "bill", "note": 7 }]')),
    ).toThrow(/must be a JSON string/);
  });

  test("rejects malformed sources", () => {
    expect(() => readGlossaryJson(withTermField('"sources": "billing.X.y"'))).toThrow(
      /must be a JSON array/,
    );
    expect(() => readGlossaryJson(withTermField('"sources": [null]'))).toThrow(
      /must be a JSON string/,
    );
  });

  test("rejects a null where an optional string is allowed, rather than treating it as absent", () => {
    expect(() => readGlossaryJson(withTermField('"definition": null'))).toThrow(TypeError);
  });

  test("enforces the model's structural invariants on a hand-edited file", () => {
    const duplicated = MINIMAL.replace(
      '"terms": [',
      `"terms": [
        {
          "term": "invoice",
          "context": "billing",
          "kind": "noun-phrase",
          "status": "curated",
          "firstSeen": "2026-08-13"
        },`,
    );

    expect(() => readGlossaryJson(duplicated)).toThrow(/duplicate term/i);
    expect(() =>
      readGlossaryJson(MINIMAL.replace('"context": "billing"', '"context": "ship"')),
    ).toThrow(/undeclared context/i);
  });

  test("treats a __proto__ context name as ordinary data and never pollutes Object.prototype", () => {
    const document = `{
      "schemaVersion": 1,
      "contexts": { "__proto__": { "packages": ["packages/x"] } },
      "terms": []
    }`;

    const model = readGlossaryJson(document);

    expect(model.contexts.get("__proto__")?.packages).toStrictEqual(["packages/x"]);
    expect(({} as Record<string, unknown>).packages).toBeUndefined();
  });

  test("rejects a __proto__ key inside a term, where it is not a declared field", () => {
    expect(() => readGlossaryJson(withTermField('"__proto__": { "status": "curated" }'))).toThrow(
      /unknown key '__proto__'/,
    );
  });
});
