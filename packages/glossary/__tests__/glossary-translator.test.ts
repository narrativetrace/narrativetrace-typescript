// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { glossary } from "../src/glossary.js";
import type { GlossaryTermInput } from "../src/glossary-term.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { glossaryTranslator } from "../src/glossary-translator.js";

function term(overrides: Partial<GlossaryTermInput> = {}) {
  return glossaryTerm({
    term: "insufficient fund",
    context: "billing",
    kind: "noun-phrase",
    status: "curated",
    firstSeen: "2026-08-13",
    translations: new Map([["es", "fondos insuficientes"]]),
    ...overrides,
  });
}

function modelOf(...terms: ReturnType<typeof term>[]) {
  const contexts = new Map(
    [...new Set(terms.map((each) => each.context))].map((name) => [
      name,
      boundedContext(name, [`packages/${name}`]),
    ]),
  );
  return glossary(1, contexts, terms);
}

describe("glossaryTranslator", () => {
  test("translates a phrase the glossary defines in that context", () => {
    const translator = glossaryTranslator(modelOf(term()), "es");

    expect(translator.translate("billing", "insufficient fund")).toEqual({
      text: "fondos insuficientes",
      translated: true,
    });
  });

  test("renders a phrase the glossary never defined as itself, untranslated", () => {
    const translator = glossaryTranslator(modelOf(term()), "es");

    expect(translator.translate("billing", "overdraft account")).toEqual({
      text: "overdraft account",
      translated: false,
    });
  });

  test("never carries a translation across a context boundary", () => {
    const model = modelOf(term(), term({ context: "shipping", term: "parcel" }));

    expect(glossaryTranslator(model, "es").translate("shipping", "insufficient fund")).toEqual({
      text: "insufficient fund",
      translated: false,
    });
  });

  test("falls back to per-token word entries when no entry spells the whole phrase", () => {
    const model = modelOf(
      term({ term: "insufficient", kind: "word", translations: new Map([["es", "insuficiente"]]) }),
      term({ term: "fund", kind: "word", translations: new Map([["es", "fondo"]]) }),
    );

    expect(glossaryTranslator(model, "es").translate("billing", "insufficient fund")).toEqual({
      text: "insuficiente fondo",
      translated: true,
    });
  });

  test("leaves the whole phrase untranslated when only some of its words are known", () => {
    const model = modelOf(
      term({ term: "fund", kind: "word", translations: new Map([["es", "fondo"]]) }),
    );

    expect(glossaryTranslator(model, "es").translate("billing", "insufficient fund")).toEqual({
      text: "insufficient fund",
      translated: false,
    });
  });

  test("reports a curated term that lacks the target locale as untranslated", () => {
    const model = modelOf(term({ translations: new Map([["fr", "fonds insuffisants"]]) }));

    expect(glossaryTranslator(model, "es").translate("billing", "insufficient fund")).toEqual({
      text: "insufficient fund",
      translated: false,
    });
  });
});
