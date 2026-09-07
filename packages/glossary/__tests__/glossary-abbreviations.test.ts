// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { classifyAbbreviation, isAcceptedAbbreviation } from "@narrativetrace/clarity";
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "../src/glossary.js";
import { readGlossaryJson } from "../src/glossary-json-reader.js";
import { writeGlossaryJson } from "../src/glossary-json-writer.js";
import { renderGlossaryMarkdown } from "../src/glossary-markdown-renderer.js";
import { mergeHarvest } from "../src/glossary-merger.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { glossaryVocabulary } from "../src/glossary-vocabulary.js";
import { harvestCandidate } from "../src/harvest-candidate.js";

/**
 * The `abbreviations` section (glossary schema 2, Java item 43). Accepted project shorthand is a
 * declaration, not a side effect of what tokens happen to appear in committed terms.
 */

const CONTEXTS = new Map([["billing", boundedContext("billing", ["packages/billing"])]]);

function term(text: string, kind: "word" | "noun-phrase" = "noun-phrase") {
  return glossaryTerm({
    term: text,
    context: "billing",
    kind,
    status: "harvested",
    firstSeen: "2026-08-30",
  });
}

const SCHEMA_1_DOCUMENT = `{
  "schemaVersion": 1,
  "contexts": {
    "billing": {
      "packages": ["packages/billing"]
    }
  },
  "terms": [
    {
      "term": "invoice",
      "context": "billing",
      "kind": "noun-phrase",
      "status": "harvested",
      "firstSeen": "2026-08-30"
    }
  ]
}
`;

const SCHEMA_2_DOCUMENT = `{
  "schemaVersion": 2,
  "contexts": {
    "billing": {
      "packages": ["packages/billing"]
    }
  },
  "abbreviations": {
    "calc": "calculate",
    "fx": "foreign exchange"
  },
  "terms": [
    {
      "term": "invoice",
      "context": "billing",
      "kind": "noun-phrase",
      "status": "harvested",
      "firstSeen": "2026-08-30"
    }
  ]
}
`;

describe("reading the abbreviations section", () => {
  test("reads a schema-2 document with the section", () => {
    const model = readGlossaryJson(SCHEMA_2_DOCUMENT);

    expect(model.schemaVersion).toBe(2);
    expect([...model.abbreviations]).toStrictEqual([
      ["calc", "calculate"],
      ["fx", "foreign exchange"],
    ]);
  });

  test("still reads a schema-1 document without it", () => {
    const model = readGlossaryJson(SCHEMA_1_DOCUMENT);

    expect(model.schemaVersion).toBe(1);
    expect(model.abbreviations.size).toBe(0);
  });

  test("accepts the section at any version at or above 1", () => {
    const stampedOne = SCHEMA_2_DOCUMENT.replace('"schemaVersion": 2', '"schemaVersion": 1');

    expect(readGlossaryJson(stampedOne).abbreviations.get("fx")).toBe("foreign exchange");
  });

  test("rejects a non-string expansion", () => {
    const broken = SCHEMA_2_DOCUMENT.replace('"calculate"', "7");

    expect(() => readGlossaryJson(broken)).toThrow(TypeError);
    expect(() => readGlossaryJson(broken)).toThrow(/abbreviation 'calc'/);
  });

  test("rejects a section that is not an object", () => {
    const broken = SCHEMA_2_DOCUMENT.replace(
      /"abbreviations": \{[^}]*\}/,
      '"abbreviations": ["fx"]',
    );

    expect(() => readGlossaryJson(broken)).toThrow(TypeError);
  });

  test("rejects a blank abbreviation and a blank expansion", () => {
    const blankKey = SCHEMA_2_DOCUMENT.replace('"calc":', '"  ":');
    const blankExpansion = SCHEMA_2_DOCUMENT.replace('"calculate"', '"  "');

    expect(() => readGlossaryJson(blankKey)).toThrow(TypeError);
    expect(() => readGlossaryJson(blankExpansion)).toThrow(TypeError);
  });
});

describe("writing the abbreviations section", () => {
  test("stamps schema 2 and emits the section when it is non-empty", () => {
    const model = glossary(
      GLOSSARY_SCHEMA_VERSION,
      CONTEXTS,
      [term("invoice")],
      new Map([["fx", "foreign exchange"]]),
    );

    const text = writeGlossaryJson(model);

    expect(text).toContain('"schemaVersion": 2,');
    expect(text).toContain('"abbreviations": {\n    "fx": "foreign exchange"\n  },');
  });

  test("keeps stamping schema 1 and omits the section when it is empty", () => {
    const model = glossary(GLOSSARY_SCHEMA_VERSION, CONTEXTS, [term("invoice")]);

    const text = writeGlossaryJson(model);

    expect(text).toContain('"schemaVersion": 1,');
    expect(text).not.toContain("abbreviations");
  });

  test("a glossary without abbreviations is byte-identical to its schema-1 form", () => {
    expect(writeGlossaryJson(readGlossaryJson(SCHEMA_1_DOCUMENT))).toBe(SCHEMA_1_DOCUMENT);
  });

  test("a schema-2 document round-trips byte-identically", () => {
    expect(writeGlossaryJson(readGlossaryJson(SCHEMA_2_DOCUMENT))).toBe(SCHEMA_2_DOCUMENT);
  });

  test("orders abbreviations by key, whatever order they were added in", () => {
    const model = glossary(
      GLOSSARY_SCHEMA_VERSION,
      CONTEXTS,
      [],
      new Map([
        ["fx", "foreign exchange"],
        ["calc", "calculate"],
      ]),
    );

    expect(writeGlossaryJson(model)).toContain(
      '"abbreviations": {\n    "calc": "calculate",\n    "fx": "foreign exchange"\n  },',
    );
  });

  test("never lowers a schema version above 2", () => {
    const model = glossary(3, CONTEXTS, [], new Map([["fx", "foreign exchange"]]));

    expect(writeGlossaryJson(model)).toContain('"schemaVersion": 3,');
  });
});

describe("the model guards the section", () => {
  test("rejects a blank abbreviation", () => {
    expect(() => glossary(1, CONTEXTS, [], new Map([[" ", "foreign exchange"]]))).toThrow(
      TypeError,
    );
  });

  test("rejects a blank expansion", () => {
    expect(() => glossary(1, CONTEXTS, [], new Map([["fx", ""]]))).toThrow(TypeError);
  });

  test("copies the caller's map, so later mutation cannot reach the glossary", () => {
    const source = new Map([["fx", "foreign exchange"]]);
    const model = glossary(1, CONTEXTS, [], source);

    source.set("calc", "calculate");

    expect(model.abbreviations.size).toBe(1);
  });
});

describe("merging never touches the section", () => {
  test("carries it through a harvest that adds terms", () => {
    const existing = glossary(
      2,
      CONTEXTS,
      [term("invoice")],
      new Map([["fx", "foreign exchange"]]),
    );

    const { glossary: merged, newTerms } = mergeHarvest(
      existing,
      [
        harvestCandidate({
          context: "billing",
          phrase: "statement",
          kind: "noun-phrase",
          site: "BillingService.renderStatement",
          identifier: "renderStatement",
          occurrences: 1,
        }),
      ],
      "2026-08-31",
    );

    expect(newTerms).toHaveLength(1);
    expect([...merged.abbreviations]).toStrictEqual([["fx", "foreign exchange"]]);
  });

  test("carries it through a harvest that adds nothing", () => {
    const existing = glossary(2, CONTEXTS, [], new Map([["fx", "foreign exchange"]]));

    const { glossary: merged } = mergeHarvest(existing, [], "2026-08-31");

    expect([...merged.abbreviations]).toStrictEqual([["fx", "foreign exchange"]]);
  });
});

describe("the reviewable Markdown document shows the decision", () => {
  test("renders a table of the declared abbreviations", () => {
    const model = glossary(
      2,
      CONTEXTS,
      [term("invoice")],
      new Map([
        ["fx", "foreign exchange"],
        ["calc", "calculate"],
      ]),
    );

    const markdown = renderGlossaryMarkdown(model);

    expect(markdown).toContain("## Abbreviations");
    expect(markdown).toContain("| `calc` | calculate |");
    expect(markdown).toContain("| `fx` | foreign exchange |");
    expect(markdown.indexOf("## Abbreviations")).toBeLessThan(markdown.indexOf("## billing"));
  });

  test("renders no section when nothing is declared", () => {
    expect(renderGlossaryMarkdown(glossary(1, CONTEXTS, [term("invoice")]))).not.toContain(
      "## Abbreviations",
    );
  });
});

describe("the vocabulary bridge", () => {
  test("accepts a listed abbreviation and spells it out", () => {
    const vocabulary = glossaryVocabulary(
      glossary(2, CONTEXTS, [term("invoice")], new Map([["fx", "foreign exchange"]])),
    );

    expect(isAcceptedAbbreviation(vocabulary, "fx")).toBe(true);
    expect(vocabulary.abbreviations.get("fx")).toBe("foreign exchange");
    expect(classifyAbbreviation("fx", vocabulary)).toBeUndefined();
  });

  test("a phrase token is a domain noun but not accepted shorthand", () => {
    const vocabulary = glossaryVocabulary(glossary(1, CONTEXTS, [term("calc total")]));

    expect(vocabulary.nouns.has("calc")).toBe(true);
    expect(isAcceptedAbbreviation(vocabulary, "calc")).toBe(false);
    expect(classifyAbbreviation("calc", vocabulary)).toBe("ambiguous");
  });

  test("a single-word term is a domain noun but still not accepted shorthand", () => {
    const vocabulary = glossaryVocabulary(glossary(1, CONTEXTS, [term("calc", "word")]));

    expect(vocabulary.nouns.has("calc")).toBe(true);
    expect(isAcceptedAbbreviation(vocabulary, "calc")).toBe(false);
  });
});
