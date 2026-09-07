// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { glossary } from "../src/glossary.js";
import { type GlossaryTermInput, glossaryTerm } from "../src/glossary-term.js";
import { synonymAlias } from "../src/synonym-alias.js";

function term(overrides: Partial<GlossaryTermInput> & { term: string; context: string }) {
  return glossaryTerm({
    kind: "noun-phrase",
    status: "harvested",
    firstSeen: "2026-08-13",
    ...overrides,
  });
}

function contexts(...names: string[]) {
  return new Map(names.map((name) => [name, boundedContext(name, [])]));
}

describe("Glossary", () => {
  test("carries its schema version, contexts and terms", () => {
    const model = glossary(1, contexts("billing"), [term({ term: "invoice", context: "billing" })]);

    expect(model.schemaVersion).toBe(1);
    expect(model.contexts.get("billing")?.name).toBe("billing");
    expect(model.terms).toHaveLength(1);
  });

  test("canonicalizes term order to (context, term) whatever the insertion order", () => {
    const model = glossary(1, contexts("billing", "shipping"), [
      term({ term: "parcel", context: "shipping" }),
      term({ term: "invoice", context: "billing" }),
      term({ term: "carrier", context: "shipping" }),
      term({ term: "account", context: "billing" }),
    ]);

    expect(model.terms.map((entry) => `${entry.context}/${entry.term}`)).toStrictEqual([
      "billing/account",
      "billing/invoice",
      "shipping/carrier",
      "shipping/parcel",
    ]);
  });

  test("orders terms by code unit, not by locale collation", () => {
    const model = glossary(1, contexts("billing"), [
      term({ term: "ab", context: "billing" }),
      term({ term: "a b", context: "billing" }),
    ]);

    expect(model.terms.map((entry) => entry.term)).toStrictEqual(["a b", "ab"]);
  });

  test("rejects a schema version below one or not a whole number", () => {
    expect(() => glossary(0, contexts(), [])).toThrow(RangeError);
    expect(() => glossary(-1, contexts(), [])).toThrow(RangeError);
    expect(() => glossary(1.5, contexts(), [])).toThrow(RangeError);
    expect(() => glossary(Number.NaN, contexts(), [])).toThrow(RangeError);
  });

  test("rejects two terms sharing one (context, term) identity", () => {
    expect(() =>
      glossary(1, contexts("billing"), [
        term({ term: "invoice", context: "billing" }),
        term({ term: "invoice", context: "billing", status: "curated" }),
      ]),
    ).toThrow(/duplicate term/i);
  });

  test("accepts the same term text in two contexts, which is the point of bounding", () => {
    const model = glossary(1, contexts("insurance", "security"), [
      term({ term: "policy", context: "insurance" }),
      term({ term: "policy", context: "security" }),
    ]);

    expect(model.terms).toHaveLength(2);
  });

  test("rejects a term referencing a context the glossary does not declare", () => {
    expect(() =>
      glossary(1, contexts("billing"), [term({ term: "parcel", context: "shipping" })]),
    ).toThrow(/undeclared context/i);
  });

  test("rejects a contexts entry filed under a key other than its own name", () => {
    const mismatched = new Map([["billing", boundedContext("shipping", [])]]);

    expect(() => glossary(1, mismatched, [])).toThrow(TypeError);
  });

  test("rejects a deprecated alias that is also a canonical term in the same context", () => {
    expect(() =>
      glossary(1, contexts("billing"), [
        term({ term: "invoice", context: "billing" }),
        term({
          term: "overdraft account",
          context: "billing",
          synonyms: [synonymAlias("invoice")],
        }),
      ]),
    ).toThrow(/alias/i);
  });

  test("allows an alias that is a canonical term in a different context", () => {
    const model = glossary(1, contexts("billing", "shipping"), [
      term({ term: "parcel", context: "shipping" }),
      term({
        term: "overdraft account",
        context: "billing",
        synonyms: [synonymAlias("parcel")],
      }),
    ]);

    expect(model.terms).toHaveLength(2);
  });

  test("copies the term list and context map so later caller mutation cannot corrupt it", () => {
    const declared = contexts("billing");
    const terms = [term({ term: "invoice", context: "billing" })];
    const model = glossary(1, declared, terms);

    terms.push(term({ term: "account", context: "billing" }));
    declared.set("shipping", boundedContext("shipping", []));

    expect(model.terms).toHaveLength(1);
    expect(model.contexts.has("shipping")).toBe(false);
  });
});
