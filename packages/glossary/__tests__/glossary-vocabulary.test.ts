// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  emptyVocabulary,
  isAcceptedAbbreviation,
  isDomainNoun,
  isDomainVerb,
} from "@narrativetrace/clarity";
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { glossary } from "../src/glossary.js";
import type { GlossaryTerm } from "../src/glossary-term.js";
import { glossaryTerm } from "../src/glossary-term.js";
import {
  glossaryVocabulary,
  readProjectVocabulary,
  type VocabularyFileReader,
} from "../src/glossary-vocabulary.js";
import { synonymAlias } from "../src/synonym-alias.js";
import type { TermKind } from "../src/term-kind.js";
import type { TermStatus } from "../src/term-status.js";

const CONTEXTS = new Map([["trading", boundedContext("trading", ["com.acme.trading"])]]);

function term(
  text: string,
  kind: TermKind,
  status: TermStatus,
  synonyms: readonly { alias: string }[] = [],
): GlossaryTerm {
  return glossaryTerm({
    term: text,
    context: "trading",
    kind,
    status,
    firstSeen: "2020-01-01",
    synonyms: synonyms.map((s) => synonymAlias(s.alias)),
  });
}

const glossaryOf = (...terms: GlossaryTerm[]) => glossary(1, CONTEXTS, terms);

describe("glossaryVocabulary", () => {
  test("a verb phrase declares its leading verb and trailing nouns", () => {
    const vocabulary = glossaryVocabulary(
      glossaryOf(term("settle trade", "verb-phrase", "curated")),
    );

    expect(isDomainVerb(vocabulary, "settle")).toBe(true);
    expect(isDomainNoun(vocabulary, "trade")).toBe(true);
    expect(isDomainNoun(vocabulary, "settle")).toBe(false);
    expect(isDomainVerb(vocabulary, "trade")).toBe(false);
  });

  test("a noun phrase declares every token as a noun", () => {
    const vocabulary = glossaryVocabulary(
      glossaryOf(term("credit tranche", "noun-phrase", "curated")),
    );

    expect(isDomainNoun(vocabulary, "credit")).toBe(true);
    expect(isDomainNoun(vocabulary, "tranche")).toBe(true);
    expect(vocabulary.verbs.size).toBe(0);
  });

  test("a word teaches as a noun without being accepted as shorthand", () => {
    // Schema 2 (Java item 43): committing `fx` as a term says it is domain vocabulary, not that
    // the project accepts `fx` as shorthand. Only the `abbreviations` section says that, so the
    // glossary no longer has to hold `fx` as a canonical term to accept it — the ubiquitous
    // language stays `foreign exchange`.
    const vocabulary = glossaryVocabulary(glossaryOf(term("fx", "word", "harvested")));

    expect(isDomainNoun(vocabulary, "fx")).toBe(true);
    expect(isAcceptedAbbreviation(vocabulary, "fx")).toBe(false);
  });

  test("harvested terms count, because the commit is the approval", () => {
    const vocabulary = glossaryVocabulary(
      glossaryOf(term("fold position", "verb-phrase", "harvested")),
    );

    expect(isDomainVerb(vocabulary, "fold")).toBe(true);
  });

  test("stale terms are no longer vocabulary", () => {
    const vocabulary = glossaryVocabulary(
      glossaryOf(term("unwind position", "verb-phrase", "stale")),
    );

    expect(vocabulary.verbs.size + vocabulary.nouns.size).toBe(0);
  });

  test("template entries are narration text, not vocabulary", () => {
    const vocabulary = glossaryVocabulary(
      glossaryOf(term("settled {amount} for {trade}", "template", "curated")),
    );

    expect(vocabulary.verbs.size + vocabulary.nouns.size).toBe(0);
  });

  test("deprecated synonyms never become vocabulary", () => {
    const vocabulary = glossaryVocabulary(
      glossaryOf(term("tranche", "word", "curated", [{ alias: "slice" }])),
    );

    expect(isDomainNoun(vocabulary, "tranche")).toBe(true);
    expect(isDomainNoun(vocabulary, "slice")).toBe(false);
    expect(isDomainVerb(vocabulary, "slice")).toBe(false);
  });

  test("every bounded context contributes, because identifiers carry no package", () => {
    const contexts = new Map([
      ["trading", boundedContext("trading", ["com.acme.trading"])],
      ["billing", boundedContext("billing", ["com.acme.billing"])],
    ]);
    const billing = glossaryTerm({
      term: "invoice",
      context: "billing",
      kind: "word",
      status: "curated",
      firstSeen: "2020-01-01",
    });

    const vocabulary = glossaryVocabulary(
      glossary(1, contexts, [term("tranche", "word", "curated"), billing]),
    );

    expect(isDomainNoun(vocabulary, "tranche")).toBe(true);
    expect(isDomainNoun(vocabulary, "invoice")).toBe(true);
  });
});

const GLOSSARY_JSON = JSON.stringify({
  schemaVersion: 1,
  contexts: { trading: { packages: ["com.acme.trading"] } },
  terms: [
    {
      term: "settle trade",
      context: "trading",
      kind: "verb-phrase",
      status: "curated",
      firstSeen: "2020-01-01",
    },
  ],
});

function reader(files: Record<string, string>): VocabularyFileReader {
  return {
    isFile: (path) => path in files,
    readText: (path) => files[path] as string,
    join: (...segments) => segments.join("/"),
  };
}

describe("readProjectVocabulary", () => {
  test("an undefined directory means no committed vocabulary, without touching the disk", () => {
    const looked: string[] = [];
    const watching: VocabularyFileReader = {
      isFile: (path) => (looked.push(path), false),
      readText: () => "",
      join: (...segments) => segments.join("/"),
    };

    expect(readProjectVocabulary(undefined, watching)).toStrictEqual(emptyVocabulary);
    expect(looked).toEqual([]);
  });

  test("a directory without a glossary means no committed vocabulary", () => {
    expect(readProjectVocabulary("/repo", reader({}))).toStrictEqual(emptyVocabulary);
  });

  test("reads the committed glossary from its directory", () => {
    const vocabulary = readProjectVocabulary(
      "/repo",
      reader({ "/repo/glossary.json": GLOSSARY_JSON }),
    );

    expect(isDomainVerb(vocabulary, "settle")).toBe(true);
    expect(isDomainNoun(vocabulary, "trade")).toBe(true);
  });

  test("a malformed committed glossary fails loudly rather than scoring without it", () => {
    expect(() =>
      readProjectVocabulary("/repo", reader({ "/repo/glossary.json": "{ not json" })),
    ).toThrow();
  });
});
