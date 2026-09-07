// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { classifyAbbreviation } from "../src/abbreviation-dictionary.js";
import { analyzeClarity } from "../src/clarity-analyzer.js";
import {
  abbreviationExpansion,
  domainVocabulary,
  emptyVocabulary,
  isAcceptedAbbreviation,
  isDomainNoun,
  isDomainVerb,
  isEmptyVocabulary,
} from "../src/domain-vocabulary.js";
import { classifyToken } from "../src/generic-token-detector.js";
import { classifyVerb } from "../src/verb-dictionary.js";

describe("domainVocabulary", () => {
  test("an empty vocabulary knows nothing", () => {
    expect(isEmptyVocabulary(emptyVocabulary)).toBe(true);
    expect(isDomainVerb(emptyVocabulary, "fold")).toBe(false);
    expect(isDomainNoun(emptyVocabulary, "tranche")).toBe(false);
    expect(isAcceptedAbbreviation(emptyVocabulary, "fx")).toBe(false);
    expect(abbreviationExpansion(emptyVocabulary, "fx")).toBeUndefined();
  });

  test("a vocabulary with any of its three parts populated is not empty", () => {
    expect(isEmptyVocabulary(domainVocabulary(["fold"], []))).toBe(false);
    expect(isEmptyVocabulary(domainVocabulary([], ["tranche"]))).toBe(false);
    expect(isEmptyVocabulary(domainVocabulary(["fold"], ["tranche"]))).toBe(false);
    expect(isEmptyVocabulary(domainVocabulary([], [], new Map([["fx", "foreign exchange"]])))).toBe(
      false,
    );
    expect(isEmptyVocabulary(domainVocabulary(["credit tranche"], [" "]))).toBe(true);
  });

  test("recognizes declared verbs and nouns, and keeps them apart", () => {
    const vocabulary = domainVocabulary(["fold"], ["tranche"]);

    expect(isDomainVerb(vocabulary, "fold")).toBe(true);
    expect(isDomainNoun(vocabulary, "tranche")).toBe(true);
    expect(isDomainVerb(vocabulary, "tranche")).toBe(false);
    expect(isDomainNoun(vocabulary, "fold")).toBe(false);
  });

  test("matches regardless of case", () => {
    const vocabulary = domainVocabulary(["Fold"], ["Tranche"]);

    expect(isDomainVerb(vocabulary, "FOLD")).toBe(true);
    expect(isDomainNoun(vocabulary, "tranche")).toBe(true);
  });

  test("drops blank and multi-word entries rather than holding what can never match", () => {
    const vocabulary = domainVocabulary(["fold ", " "], ["credit tranche", ""]);

    expect(isDomainVerb(vocabulary, "fold")).toBe(true);
    expect(isDomainNoun(vocabulary, "credit")).toBe(false);
    expect(isDomainNoun(vocabulary, "credit tranche")).toBe(false);
    expect(isDomainNoun(vocabulary, "")).toBe(false);
  });
});

describe("accepted abbreviations", () => {
  test("accepts only what the abbreviations section declares", () => {
    const vocabulary = domainVocabulary(["calc"], ["fx"], new Map([["ord", "order"]]));

    expect(isAcceptedAbbreviation(vocabulary, "ord")).toBe(true);
    expect(isAcceptedAbbreviation(vocabulary, "calc")).toBe(false);
    expect(isAcceptedAbbreviation(vocabulary, "fx")).toBe(false);
    expect(isAcceptedAbbreviation(vocabulary, "mgr")).toBe(false);
  });

  test("spells an accepted abbreviation out from its declared expansion", () => {
    const vocabulary = domainVocabulary([], [], new Map([["fx", "foreign exchange"]]));

    expect(abbreviationExpansion(vocabulary, "fx")).toBe("foreign exchange");
    expect(abbreviationExpansion(vocabulary, "calc")).toBeUndefined();
  });

  test("matches regardless of case", () => {
    const vocabulary = domainVocabulary([], [], new Map([["FX", "foreign exchange"]]));

    expect(isAcceptedAbbreviation(vocabulary, "fx")).toBe(true);
    expect(abbreviationExpansion(vocabulary, "Fx")).toBe("foreign exchange");
  });

  test("drops entries that can never match or teach", () => {
    const vocabulary = domainVocabulary(
      [],
      [],
      new Map([
        ["ord", "order"],
        ["foreign exchange", "fx"],
        ["", "empty key"],
        ["  ", "blank key"],
        ["nx", "   "],
      ]),
    );

    expect(isAcceptedAbbreviation(vocabulary, "ord")).toBe(true);
    expect(isAcceptedAbbreviation(vocabulary, "foreign exchange")).toBe(false);
    expect(isAcceptedAbbreviation(vocabulary, "")).toBe(false);
    expect(isAcceptedAbbreviation(vocabulary, "nx")).toBe(false);
  });
});

describe("the built-in dictionaries keep their authority", () => {
  test("a declared verb the dictionaries do not know becomes a domain verb", () => {
    const vocabulary = domainVocabulary(["fold"], []);

    expect(classifyVerb("fold")).toBe("unknown");
    expect(classifyVerb("fold", vocabulary)).toBe("domain");
  });

  test("a declared verb outranks the standard tier", () => {
    expect(classifyVerb("send")).toBe("standard");
    expect(classifyVerb("send", domainVocabulary(["send"], []))).toBe("domain");
  });

  test("generic verbs stay generic however a project declares them", () => {
    const vocabulary = domainVocabulary(["process", "handle"], []);

    expect(classifyVerb("process", vocabulary)).toBe("generic");
    expect(classifyVerb("handle", vocabulary)).toBe("generic");
  });

  test("boolean prefixes stay boolean however a project declares them", () => {
    expect(classifyVerb("is", domainVocabulary(["is"], []))).toBe("boolean");
  });

  test("declared nouns are not verbs", () => {
    expect(classifyVerb("tranche", domainVocabulary([], ["tranche"]))).toBe("unknown");
  });

  test("a declared noun lifts a broad or vague word to domain", () => {
    const vocabulary = domainVocabulary([], ["position", "record"]);

    expect(classifyToken("position", vocabulary)).toBe("domain");
    expect(classifyToken("record", vocabulary)).toBe("domain");
  });

  test("meaningless placeholders are not rescued by being written down", () => {
    const vocabulary = domainVocabulary([], ["temp", "foo", "x"]);

    expect(classifyToken("temp", vocabulary)).toBe("meaningless");
    expect(classifyToken("foo", vocabulary)).toBe("meaningless");
    expect(classifyToken("x", vocabulary)).toBe("meaningless");
  });

  test("declared verbs are not nouns", () => {
    expect(classifyToken("data", domainVocabulary(["data"], []))).toBe("vague");
  });

  test("a listed abbreviation stops being an abbreviation", () => {
    const vocabulary = domainVocabulary(
      [],
      [],
      new Map([
        ["acc", "account"],
        ["calc", "calculate"],
      ]),
    );

    expect(classifyAbbreviation("acc")).toBe("ambiguous");
    expect(classifyAbbreviation("acc", vocabulary)).toBeUndefined();
    expect(classifyAbbreviation("calc", vocabulary)).toBeUndefined();
  });

  test("a phrase token does not silently accept an abbreviation", () => {
    // Java item 43's evidence, inverted: committing the phrase `calc total` used to
    // accept `calc` repository-wide, dropping the `calc → calculate` hint everywhere.
    // Acceptance is a declaration now, so harvesting a phrase cannot make one.
    const vocabulary = domainVocabulary([], ["calc", "total"]);

    expect(classifyAbbreviation("calc", vocabulary)).toBe("ambiguous");
  });

  test("undeclared abbreviations stay penalized", () => {
    expect(classifyAbbreviation("mgr", domainVocabulary([], ["acc"]))).toBe("wellKnown");
  });
});

describe("analyzeClarity with a project vocabulary", () => {
  const tree = {
    roots: [
      {
        signature: {
          className: "TrancheService",
          methodName: "foldTranche",
          parameters: [{ name: "tranche", value: '"t-1"', truncated: false }],
        },
        children: [],
        outcome: { kind: "returned" as const, value: '"ok"' },
        durationNanos: 1_000_000,
      },
    ],
  };

  test("raises the score of the project's own words", () => {
    const withoutGlossary = analyzeClarity(tree as never);
    const withGlossary = analyzeClarity(tree as never, domainVocabulary(["fold"], ["tranche"]));

    expect(withGlossary.method).toBeGreaterThan(withoutGlossary.method);
    expect(withGlossary.overall).toBeGreaterThan(withoutGlossary.overall);
  });

  test("an omitted vocabulary scores exactly as an empty one", () => {
    expect(analyzeClarity(tree as never, emptyVocabulary)).toEqual(analyzeClarity(tree as never));
  });
});
