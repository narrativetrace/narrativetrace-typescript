// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { glossary } from "../src/glossary.js";
import { writeGlossaryJson } from "../src/glossary-json-writer.js";
import { type GlossaryTermInput, glossaryTerm } from "../src/glossary-term.js";
import { synonymAlias } from "../src/synonym-alias.js";

/** U+0001, built by code point so no invisible control character sits in this file. */
const CONTROL_CHAR = String.fromCharCode(1);

function term(overrides: Partial<GlossaryTermInput> & { term: string; context: string }) {
  return glossaryTerm({
    kind: "noun-phrase",
    status: "harvested",
    firstSeen: "2026-08-13",
    ...overrides,
  });
}

describe("writeGlossaryJson", () => {
  test("writes a fully curated glossary in the canonical layout", () => {
    const model = glossary(
      1,
      new Map([
        ["billing", boundedContext("billing", ["packages/billing"], "Charging, invoicing, funds")],
      ]),
      [
        term({
          term: "overdraft account",
          context: "billing",
          status: "curated",
          definition: "Account permitted to go below zero.",
          translations: new Map([["es", "cuenta con descubierto"]]),
          synonyms: [synonymAlias("account with overdraft", "legacy v1 API phrasing")],
          sources: ["billing.OverdraftService.openOverdraftAccount"],
        }),
      ],
    );

    expect(writeGlossaryJson(model)).toBe(`{
  "schemaVersion": 1,
  "contexts": {
    "billing": {
      "packages": ["packages/billing"],
      "description": "Charging, invoicing, funds"
    }
  },
  "terms": [
    {
      "term": "overdraft account",
      "context": "billing",
      "kind": "noun-phrase",
      "status": "curated",
      "definition": "Account permitted to go below zero.",
      "translations": {
        "es": "cuenta con descubierto"
      },
      "synonyms": [
        { "alias": "account with overdraft", "note": "legacy v1 API phrasing" }
      ],
      "sources": ["billing.OverdraftService.openOverdraftAccount"],
      "firstSeen": "2026-08-13"
    }
  ]
}
`);
  });

  test("writes an empty glossary without dangling braces", () => {
    expect(writeGlossaryJson(glossary(1, new Map(), []))).toBe(`{
  "schemaVersion": 1,
  "contexts": {},
  "terms": []
}
`);
  });

  test("omits every field a freshly harvested term has not earned yet", () => {
    const model = glossary(1, new Map([["billing", boundedContext("billing", [])]]), [
      term({ term: "invoice", context: "billing" }),
    ]);

    expect(writeGlossaryJson(model)).toBe(`{
  "schemaVersion": 1,
  "contexts": {
    "billing": {
      "packages": []
    }
  },
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
`);
  });

  test("sorts contexts by name whatever order they were declared in", () => {
    const model = glossary(
      1,
      new Map([
        ["shipping", boundedContext("shipping", [])],
        ["billing", boundedContext("billing", [])],
        ["_unassigned", boundedContext("_unassigned", [])],
      ]),
      [],
    );

    expect(writeGlossaryJson(model)).toContain(
      '"contexts": {\n    "_unassigned": {\n      "packages": []\n    },\n    "billing"',
    );
  });

  test("sorts translation locales so a curated entry cannot churn on map order", () => {
    const model = glossary(1, new Map([["billing", boundedContext("billing", [])]]), [
      term({
        term: "invoice",
        context: "billing",
        translations: new Map([
          ["fr", "facture"],
          ["de", "Rechnung"],
          ["es", "factura"],
        ]),
      }),
    ]);

    expect(writeGlossaryJson(model)).toContain(
      '"translations": {\n        "de": "Rechnung",\n        "es": "factura",\n        "fr": "facture"\n      }',
    );
  });

  test("writes a synonym without a note as a single-key object", () => {
    const model = glossary(1, new Map([["billing", boundedContext("billing", [])]]), [
      term({ term: "invoice", context: "billing", synonyms: [synonymAlias("bill")] }),
    ]);

    expect(writeGlossaryJson(model)).toContain('{ "alias": "bill" }');
  });

  test("writes several packages, synonyms and sources with the canonical separators", () => {
    const model = glossary(
      1,
      new Map([["billing", boundedContext("billing", ["packages/billing", "packages/invoicing"])]]),
      [
        term({
          term: "invoice",
          context: "billing",
          synonyms: [synonymAlias("bill"), synonymAlias("statement", "pre-2020 wording")],
          sources: ["billing.Invoicer.issue", "billing.Invoicer.void"],
        }),
      ],
    );
    const json = writeGlossaryJson(model);

    expect(json).toContain('"packages": ["packages/billing", "packages/invoicing"]');
    expect(json).toContain(
      '"synonyms": [\n        { "alias": "bill" },\n        { "alias": "statement", "note": "pre-2020 wording" }\n      ]',
    );
    expect(json).toContain('"sources": ["billing.Invoicer.issue", "billing.Invoicer.void"]');
  });

  test("escapes quotes, backslashes, newlines and control characters in curated prose", () => {
    const model = glossary(1, new Map([["billing", boundedContext("billing", [])]]), [
      term({
        term: "invoice",
        context: "billing",
        definition: `A "bill"\\ with\na newline\tand ${CONTROL_CHAR} control`,
      }),
    ]);

    expect(writeGlossaryJson(model)).toContain(
      '"definition": "A \\"bill\\"\\\\ with\\na newline\\tand \\u0001 control"',
    );
  });

  test("escapes a context name and a term that contain a quote", () => {
    const model = glossary(1, new Map([['we"ird', boundedContext('we"ird', ['pack"ages'])]]), [
      term({ term: 'in"voice', context: 'we"ird' }),
    ]);
    const json = writeGlossaryJson(model);

    expect(json).toContain('"we\\"ird": {');
    expect(json).toContain('"packages": ["pack\\"ages"]');
    expect(json).toContain('"term": "in\\"voice"');
  });

  test("ends the document with exactly one trailing newline", () => {
    const json = writeGlossaryJson(glossary(1, new Map(), []));

    expect(json.endsWith("}\n")).toBe(true);
    expect(json.endsWith("}\n\n")).toBe(false);
  });

  test("writes byte-identical output for two glossaries built in different orders", () => {
    const contexts = () =>
      new Map([
        ["billing", boundedContext("billing", [])],
        ["shipping", boundedContext("shipping", [])],
      ]);
    const invoice = term({ term: "invoice", context: "billing" });
    const parcel = term({ term: "parcel", context: "shipping" });

    expect(writeGlossaryJson(glossary(1, contexts(), [invoice, parcel]))).toBe(
      writeGlossaryJson(glossary(1, contexts(), [parcel, invoice])),
    );
  });
});
