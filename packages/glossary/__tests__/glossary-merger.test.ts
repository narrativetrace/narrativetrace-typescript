// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "../src/glossary.js";
import { mergeHarvest } from "../src/glossary-merger.js";
import { type GlossaryTermInput, glossaryTerm } from "../src/glossary-term.js";
import { type HarvestCandidate, harvestCandidate } from "../src/harvest-candidate.js";
import { synonymAlias } from "../src/synonym-alias.js";

const TODAY = "2026-08-13";

function observed(phrase: string, overrides: Partial<HarvestCandidate> = {}): HarvestCandidate {
  return harvestCandidate({
    context: "billing",
    phrase,
    kind: "noun-phrase",
    site: "OverdraftService.open",
    identifier: "open",
    occurrences: 1,
    ...overrides,
  });
}

function existing(...terms: readonly GlossaryTermInput[]) {
  const built = terms.map((each) => glossaryTerm(each));
  const contexts = new Map(
    built.map((each) => [each.context, boundedContext(each.context, [])] as const),
  );
  return glossary(GLOSSARY_SCHEMA_VERSION, contexts, built);
}

const CURATED: GlossaryTermInput = {
  term: "overdraft account",
  context: "billing",
  kind: "noun-phrase",
  status: "curated",
  firstSeen: "2026-01-01",
  definition: "Account permitted to go below zero.",
  sources: ["OverdraftService.openOverdraftAccount"],
};

const EMPTY = glossary(
  GLOSSARY_SCHEMA_VERSION,
  new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
  [],
);

describe("mergeHarvest", () => {
  test("adds an unseen phrase as a harvested term dated by the caller's clock", () => {
    const result = mergeHarvest(EMPTY, [observed("overdraft account")], TODAY);

    expect(result.newTerms).toHaveLength(1);
    expect(result.newTerms[0]).toMatchObject({
      term: "overdraft account",
      context: "billing",
      kind: "noun-phrase",
      status: "harvested",
      firstSeen: TODAY,
      sources: ["OverdraftService.open"],
    });
    expect(result.glossary.terms).toHaveLength(1);
  });

  test("leaves an already-known term untouched and reports it as no new term", () => {
    const result = mergeHarvest(existing(CURATED), [observed("overdraft account")], TODAY);

    expect(result.newTerms).toStrictEqual([]);
    expect(result.glossary.terms).toStrictEqual(existing(CURATED).terms);
  });

  test("suppresses a phrase deprecated as an alias, reporting it instead of adding it", () => {
    const model = existing({ ...CURATED, synonyms: [synonymAlias("account with overdraft")] });
    const use = observed("account with overdraft");

    const result = mergeHarvest(model, [use], TODAY);

    expect(result.newTerms).toStrictEqual([]);
    expect(result.suppressedAliasUses).toStrictEqual([use]);
    expect(result.glossary.terms).toHaveLength(1);
  });

  test("harvests a phrase that is only an alias in some other context", () => {
    const model = existing({ ...CURATED, synonyms: [synonymAlias("account with overdraft")] });

    const result = mergeHarvest(
      model,
      [observed("account with overdraft", { context: "shipping" })],
      TODAY,
    );

    expect(result.suppressedAliasUses).toStrictEqual([]);
    expect(result.newTerms[0]).toMatchObject({
      term: "account with overdraft",
      context: "shipping",
    });
  });

  test("declares a context the harvest brought in, claiming no paths for it", () => {
    const result = mergeHarvest(EMPTY, [observed("parcel", { context: "shipping" })], TODAY);

    expect(result.glossary.contexts.get("shipping")).toStrictEqual(boundedContext("shipping", []));
  });

  test("leaves a declared context exactly as its author wrote it", () => {
    const result = mergeHarvest(EMPTY, [observed("overdraft account")], TODAY);

    expect(result.glossary.contexts.get("billing")).toStrictEqual(
      boundedContext("billing", ["packages/billing"]),
    );
  });

  test("describes the unassigned context it creates, since no human declared it", () => {
    const result = mergeHarvest(EMPTY, [observed("parcel", { context: "_unassigned" })], TODAY);

    expect(result.glossary.contexts.get("_unassigned")).toStrictEqual(
      boundedContext("_unassigned", [], "Harvested terms not yet mapped to a context"),
    );
  });

  test("collects the distinct sites of one phrase, capped so the file cannot grow unbounded", () => {
    const sites = ["A.a", "B.b", "C.c", "D.d"].map((site) =>
      observed("overdraft account", { site }),
    );

    const result = mergeHarvest(EMPTY, sites, TODAY);

    expect(result.newTerms[0]?.sources).toStrictEqual(["A.a", "B.b", "C.c"]);
  });

  test("records one source per distinct site, not one per observation", () => {
    const twice = [observed("overdraft account"), observed("overdraft account")];

    const result = mergeHarvest(EMPTY, twice, TODAY);

    expect(result.newTerms[0]?.sources).toStrictEqual(["OverdraftService.open"]);
  });

  test("keeps the kind of the first observation when one phrase is seen as two kinds", () => {
    const harvest = [
      observed("charge", { kind: "verb-phrase" }),
      observed("charge", { kind: "word", site: "B.b" }),
    ];

    expect(mergeHarvest(EMPTY, harvest, TODAY).newTerms[0]?.kind).toBe("verb-phrase");
  });

  test("adds nothing for an empty harvest", () => {
    const result = mergeHarvest(existing(CURATED), [], TODAY);

    expect(result.newTerms).toStrictEqual([]);
    expect(result.suppressedAliasUses).toStrictEqual([]);
    expect(result.glossary).toStrictEqual(existing(CURATED));
  });

  test("rejects a firstSeen that is not a real calendar date, naming the field", () => {
    expect(() => mergeHarvest(EMPTY, [], "2026-02-30")).toThrow(
      new RangeError("firstSeen is not a real calendar date: '2026-02-30'"),
    );
    expect(() => mergeHarvest(EMPTY, [], "13-08-2026")).toThrow(
      new RangeError("firstSeen must be an ISO date (YYYY-MM-DD): '13-08-2026'"),
    );
  });

  test("re-merging the same harvest changes nothing", () => {
    const harvest = [observed("overdraft account"), observed("parcel", { context: "shipping" })];
    const once = mergeHarvest(EMPTY, harvest, TODAY);

    const twice = mergeHarvest(once.glossary, harvest, "2026-09-01");

    expect(twice.glossary).toStrictEqual(once.glossary);
    expect(twice.newTerms).toStrictEqual([]);
  });
});
