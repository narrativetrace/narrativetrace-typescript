// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { aliasIndex } from "../src/alias-index.js";
import { boundedContext } from "../src/bounded-context.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "../src/glossary.js";
import { type GlossaryTermInput, glossaryTerm } from "../src/glossary-term.js";
import { synonymAlias } from "../src/synonym-alias.js";

function term(input: Omit<GlossaryTermInput, "kind" | "status" | "firstSeen">) {
  return glossaryTerm({
    kind: "noun-phrase",
    status: "curated",
    firstSeen: "2026-08-13",
    ...input,
  });
}

function indexOf(...terms: ReturnType<typeof term>[]) {
  const contexts = new Map(
    terms.map((each) => [each.context, boundedContext(each.context, [])] as const),
  );
  return aliasIndex(glossary(GLOSSARY_SCHEMA_VERSION, contexts, terms));
}

describe("aliasIndex", () => {
  test("finds the canonical term a deprecated phrase points to", () => {
    const index = indexOf(
      term({
        term: "overdraft account",
        context: "billing",
        synonyms: [synonymAlias("account with overdraft")],
      }),
    );

    expect(index.canonicalFor("billing", "account with overdraft")?.term).toBe("overdraft account");
  });

  test("returns undefined for a phrase no term deprecates", () => {
    const index = indexOf(
      term({
        term: "overdraft account",
        context: "billing",
        synonyms: [synonymAlias("account with overdraft")],
      }),
    );

    expect(index.canonicalFor("billing", "invoice")).toBeUndefined();
  });

  test("recognizes an alias only in the context that deprecates it", () => {
    const index = indexOf(
      term({ term: "parcel", context: "shipping" }),
      term({
        term: "shipment",
        context: "billing",
        synonyms: [synonymAlias("parcel")],
      }),
    );

    expect(index.canonicalFor("billing", "parcel")?.term).toBe("shipment");
    expect(index.canonicalFor("shipping", "parcel")).toBeUndefined();
  });

  test("matches the whole phrase, never a phrase that merely contains the alias", () => {
    const index = indexOf(
      term({
        term: "overdraft account",
        context: "billing",
        synonyms: [synonymAlias("account with overdraft")],
      }),
    );

    expect(index.canonicalFor("billing", "account with overdraft protection")).toBeUndefined();
    expect(index.canonicalFor("billing", "account with")).toBeUndefined();
  });

  test("indexes every alias of a term, and every term of a context", () => {
    const index = indexOf(
      term({
        term: "overdraft account",
        context: "billing",
        synonyms: [
          synonymAlias("account with overdraft"),
          synonymAlias("negative balance account"),
        ],
      }),
      term({ term: "invoice", context: "billing", synonyms: [synonymAlias("bill")] }),
    );

    expect(index.canonicalFor("billing", "account with overdraft")?.term).toBe("overdraft account");
    expect(index.canonicalFor("billing", "negative balance account")?.term).toBe(
      "overdraft account",
    );
    expect(index.canonicalFor("billing", "bill")?.term).toBe("invoice");
  });

  test("answers undefined for every lookup when no term declares a synonym", () => {
    const index = indexOf(term({ term: "invoice", context: "billing" }));

    expect(index.canonicalFor("billing", "invoice")).toBeUndefined();
    expect(index.canonicalFor("billing", "bill")).toBeUndefined();
  });

  test("keeps the context and phrase halves of a key apart", () => {
    const index = indexOf(
      term({ term: "overdraft account", context: "billing", synonyms: [synonymAlias("a b")] }),
    );

    expect(index.canonicalFor("billing", "a b")?.term).toBe("overdraft account");
    expect(index.canonicalFor("billing a", "b")).toBeUndefined();
  });

  test("never answers with an inherited object property", () => {
    const index = indexOf(term({ term: "invoice", context: "billing" }));

    expect(index.canonicalFor("billing", "constructor")).toBeUndefined();
    expect(index.canonicalFor("__proto__", "toString")).toBeUndefined();
  });
});
