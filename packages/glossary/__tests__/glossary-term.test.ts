// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { glossaryTerm } from "../src/glossary-term.js";
import { synonymAlias } from "../src/synonym-alias.js";

const REQUIRED = {
  term: "overdraft account",
  context: "billing",
  kind: "noun-phrase",
  status: "curated",
  firstSeen: "2026-08-13",
} as const;

describe("GlossaryTerm", () => {
  test("carries every curated field it is given", () => {
    const term = glossaryTerm({
      ...REQUIRED,
      definition: "Account permitted to go below zero.",
      translations: new Map([["es", "cuenta con descubierto"]]),
      synonyms: [synonymAlias("account with overdraft", "legacy v1 API phrasing")],
      sources: ["billing.OverdraftService.openOverdraftAccount"],
    });

    expect(term.term).toBe("overdraft account");
    expect(term.context).toBe("billing");
    expect(term.kind).toBe("noun-phrase");
    expect(term.status).toBe("curated");
    expect(term.definition).toBe("Account permitted to go below zero.");
    expect(term.translations.get("es")).toBe("cuenta con descubierto");
    expect(term.synonyms[0]?.alias).toBe("account with overdraft");
    expect(term.sources).toStrictEqual(["billing.OverdraftService.openOverdraftAccount"]);
    expect(term.firstSeen).toBe("2026-08-13");
  });

  test("defaults the human-owned collections to empty for a freshly harvested term", () => {
    const term = glossaryTerm({ ...REQUIRED, status: "harvested" });

    expect(term.definition).toBeUndefined();
    expect(term.translations.size).toBe(0);
    expect(term.synonyms).toStrictEqual([]);
    expect(term.sources).toStrictEqual([]);
  });

  test("rejects a blank term or context", () => {
    expect(() => glossaryTerm({ ...REQUIRED, term: "  " })).toThrow(TypeError);
    expect(() => glossaryTerm({ ...REQUIRED, context: "" })).toThrow(TypeError);
  });

  test("rejects a kind or status outside the declared taxonomy", () => {
    expect(() => glossaryTerm({ ...REQUIRED, kind: "phrase" as never })).toThrow(TypeError);
    expect(() => glossaryTerm({ ...REQUIRED, status: "reviewed" as never })).toThrow(TypeError);
  });

  test("rejects a firstSeen that is not an ISO calendar date", () => {
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "13 Aug 2026" })).toThrow(RangeError);
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "2026-8-13" })).toThrow(RangeError);
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "2026-08-13T00:00:00Z" })).toThrow(
      RangeError,
    );
  });

  test("rejects a firstSeen that is well-formed but not a real calendar day", () => {
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "2026-02-30" })).toThrow(RangeError);
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "2026-13-01" })).toThrow(RangeError);
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "2026-00-10" })).toThrow(RangeError);
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "2026-08-00" })).toThrow(RangeError);
  });

  test("accepts a leap day in a leap year", () => {
    expect(glossaryTerm({ ...REQUIRED, firstSeen: "2028-02-29" }).firstSeen).toBe("2028-02-29");
  });

  test("rejects a leap day in a common year", () => {
    expect(() => glossaryTerm({ ...REQUIRED, firstSeen: "2026-02-29" })).toThrow(RangeError);
  });

  test("rejects a blank translation locale, which no reader could look up", () => {
    expect(() => glossaryTerm({ ...REQUIRED, translations: new Map([["", "cuenta"]]) })).toThrow(
      TypeError,
    );
  });

  test("copies the collections so later caller mutation cannot corrupt the term", () => {
    const translations = new Map([["es", "cuenta con descubierto"]]);
    const synonyms = [synonymAlias("account with overdraft")];
    const sources = ["billing.OverdraftService.openOverdraftAccount"];
    const term = glossaryTerm({ ...REQUIRED, translations, synonyms, sources });

    translations.set("fr", "compte à découvert");
    synonyms.push(synonymAlias("overdraft-enabled account"));
    sources.push("billing.LegacyService.open");

    expect(term.translations.size).toBe(1);
    expect(term.synonyms).toHaveLength(1);
    expect(term.sources).toHaveLength(1);
  });
});
