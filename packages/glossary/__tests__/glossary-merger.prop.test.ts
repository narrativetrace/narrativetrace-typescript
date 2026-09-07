// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "../src/glossary.js";
import { writeGlossaryJson } from "../src/glossary-json-writer.js";
import { mergeHarvest } from "../src/glossary-merger.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { harvestCandidate } from "../src/harvest-candidate.js";
import { synonymAlias } from "../src/synonym-alias.js";
import { TERM_KINDS } from "../src/term-kind.js";
import { TERM_STATUSES } from "../src/term-status.js";

const TODAY = "2026-08-13";

/**
 * Deliberately tiny pools: the merge rules only bite when a harvested phrase collides with an
 * existing term or a declared alias, and unconstrained strings would almost never collide.
 */
const CONTEXTS = ["billing", "shipping", "_unassigned"];
const PHRASES = ["invoice", "parcel", "overdraft account", "charge", "account with overdraft"];

const termArbitrary = fc.record({
  context: fc.constantFrom(...CONTEXTS),
  term: fc.constantFrom(...PHRASES),
  kind: fc.constantFrom(...TERM_KINDS),
  status: fc.constantFrom(...TERM_STATUSES),
  firstSeen: fc.constantFrom("2024-02-29", "2025-12-31", "2026-01-01"),
  definition: fc.option(fc.constant("human-written meaning"), { nil: undefined }),
  aliases: fc.subarray(PHRASES),
});

/** Aliases are filtered, not rejected: the model forbids an alias that names a term of its context. */
const glossaryArbitrary = fc
  .uniqueArray(termArbitrary, {
    maxLength: 6,
    selector: (entry) => `${entry.context}/${entry.term}`,
  })
  .map((terms) => {
    const canonical = new Set(terms.map((entry) => `${entry.context}/${entry.term}`));
    return glossary(
      GLOSSARY_SCHEMA_VERSION,
      new Map(CONTEXTS.map((name) => [name, boundedContext(name, [`packages/${name}`])])),
      terms.map((entry) =>
        glossaryTerm({
          ...entry,
          synonyms: entry.aliases
            .filter((alias) => !canonical.has(`${entry.context}/${alias}`))
            .map((alias) => synonymAlias(alias)),
        }),
      ),
    );
  });

const harvestArbitrary = fc.array(
  fc
    .record({
      context: fc.constantFrom(...CONTEXTS),
      phrase: fc.constantFrom(...PHRASES),
      kind: fc.constantFrom(...TERM_KINDS),
      site: fc.constantFrom("A.a", "B.b", "C.c", "D.d"),
    })
    .map((observation) =>
      harvestCandidate({ ...observation, identifier: "identifier", occurrences: 1 }),
    ),
  { maxLength: 12 },
);

const scenario = fc.record({ model: glossaryArbitrary, harvest: harvestArbitrary });

test("merging never removes or rewrites an existing entry", () => {
  fc.assert(
    fc.property(scenario, ({ model, harvest }) => {
      const merged = mergeHarvest(model, harvest, TODAY).glossary;

      expect(merged.terms.length).toBeGreaterThanOrEqual(model.terms.length);
      for (const term of model.terms) expect(merged.terms).toContain(term);
    }),
    { numRuns: 300 },
  );
});

test("re-merging the same harvest is a no-op, down to the bytes of the file", () => {
  fc.assert(
    fc.property(scenario, ({ model, harvest }) => {
      const once = mergeHarvest(model, harvest, TODAY);

      // A later date would show up in firstSeen if any term were re-created.
      const twice = mergeHarvest(once.glossary, harvest, "2027-03-04");

      expect(twice.newTerms).toStrictEqual([]);
      expect(writeGlossaryJson(twice.glossary)).toBe(writeGlossaryJson(once.glossary));
    }),
    { numRuns: 300 },
  );
});

test("a phrase deprecated as an alias never enters the glossary as a term", () => {
  fc.assert(
    fc.property(scenario, ({ model, harvest }) => {
      const result = mergeHarvest(model, harvest, TODAY);

      for (const term of model.terms) {
        for (const synonym of term.synonyms) {
          expect(
            result.newTerms.some(
              (fresh) => fresh.context === term.context && fresh.term === synonym.alias,
            ),
          ).toBe(false);
        }
      }
    }),
    { numRuns: 300 },
  );
});

test("every new term was observed, and every observation is accounted for exactly once", () => {
  fc.assert(
    fc.property(scenario, ({ model, harvest }) => {
      const { newTerms, suppressedAliasUses } = mergeHarvest(model, harvest, TODAY);
      const observed = new Set(
        harvest.map((candidate) => `${candidate.context}/${candidate.phrase}`),
      );

      for (const term of newTerms) expect(observed).toContain(`${term.context}/${term.term}`);
      for (const use of suppressedAliasUses) expect(harvest).toContain(use);
      expect(new Set(newTerms.map((term) => `${term.context}/${term.term}`)).size).toBe(
        newTerms.length,
      );
    }),
    { numRuns: 300 },
  );
});
