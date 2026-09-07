// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "../src/glossary.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { type HarvestCandidate, harvestCandidate } from "../src/harvest-candidate.js";
import { synonymAlias } from "../src/synonym-alias.js";
import { collectViolations } from "../src/vocabulary-violations.js";

/** Billing deprecates "account with overdraft"; shipping uses the same phrase legitimately. */
const MODEL = glossary(
  GLOSSARY_SCHEMA_VERSION,
  new Map([
    ["billing", boundedContext("billing", ["packages/billing"])],
    ["shipping", boundedContext("shipping", ["packages/shipping"])],
  ]),
  [
    glossaryTerm({
      term: "overdraft account",
      context: "billing",
      kind: "noun-phrase",
      status: "curated",
      firstSeen: "2026-01-01",
      synonyms: [synonymAlias("account with overdraft")],
    }),
  ],
);

function suppressed(overrides: Partial<HarvestCandidate> = {}): HarvestCandidate {
  return harvestCandidate({
    context: "billing",
    phrase: "account with overdraft",
    kind: "noun-phrase",
    site: "OverdraftService.openAccountWithOverdraft",
    identifier: "openAccountWithOverdraft",
    occurrences: 1,
    ...overrides,
  });
}

describe("collectViolations", () => {
  test("names the canonical term and the rename that reaches it", () => {
    expect(collectViolations(MODEL, [suppressed()])).toStrictEqual([
      {
        context: "billing",
        alias: "account with overdraft",
        canonicalTerm: "overdraft account",
        site: "OverdraftService.openAccountWithOverdraft",
        identifier: "openAccountWithOverdraft",
        suggestedIdentifier: "openOverdraftAccount",
        occurrences: 1,
      },
    ]);
  });

  test("omits the rename when the alias tokens are not contiguous in the identifier", () => {
    const use = suppressed({ identifier: "accountReopenedWithOverdraft", site: "A.a" });

    expect(collectViolations(MODEL, [use])[0]).not.toHaveProperty("suggestedIdentifier");
  });

  test("sums uses of one identifier at one site, whatever kind they were observed as", () => {
    const uses = [suppressed(), suppressed({ kind: "verb-phrase", occurrences: 3 })];

    expect(collectViolations(MODEL, uses)).toHaveLength(1);
    expect(collectViolations(MODEL, uses)[0]?.occurrences).toBe(4);
  });

  test("keeps uses at different sites apart", () => {
    const uses = [suppressed({ site: "B.b" }), suppressed({ site: "A.a" })];

    expect(collectViolations(MODEL, uses).map((violation) => violation.site)).toStrictEqual([
      "A.a",
      "B.b",
    ]);
  });

  test("keeps different identifiers at one site apart", () => {
    const uses = [
      suppressed({ site: "A.a", identifier: "openAccountWithOverdraft" }),
      suppressed({ site: "A.a", identifier: "closeAccountWithOverdraft" }),
    ];

    expect(collectViolations(MODEL, uses).map((violation) => violation.identifier)).toStrictEqual([
      "closeAccountWithOverdraft",
      "openAccountWithOverdraft",
    ]);
  });

  test("orders violations by context first, then by the alias they used", () => {
    const shipping = glossary(GLOSSARY_SCHEMA_VERSION, MODEL.contexts, [
      ...MODEL.terms,
      glossaryTerm({
        term: "shipment",
        context: "shipping",
        kind: "word",
        status: "curated",
        firstSeen: "2026-01-01",
        synonyms: [synonymAlias("parcel"), synonymAlias("package")],
      }),
    ]);
    // The identifiers deliberately sort the other way round, so an order that ignored context and
    // alias would come out differently.
    const uses = [
      suppressed({ context: "shipping", phrase: "parcel", identifier: "aParcel", site: "S.s" }),
      suppressed({ identifier: "zAccountWithOverdraft", site: "S.s" }),
      suppressed({ context: "shipping", phrase: "package", identifier: "zPackage", site: "S.s" }),
    ];

    expect(collectViolations(shipping, uses).map((violation) => violation.alias)).toStrictEqual([
      "account with overdraft",
      "package",
      "parcel",
    ]);
  });

  test("reports nothing when nothing was suppressed", () => {
    expect(collectViolations(MODEL, [])).toStrictEqual([]);
  });

  test("refuses a candidate that is not deprecated in its context", () => {
    const notAnAlias = suppressed({ context: "shipping" });

    expect(() => collectViolations(MODEL, [notAnAlias])).toThrow(
      new TypeError("'account with overdraft' is not a deprecated alias in context 'shipping'"),
    );
  });
});
