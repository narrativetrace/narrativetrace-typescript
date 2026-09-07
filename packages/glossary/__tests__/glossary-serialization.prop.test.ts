// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { type Glossary, glossary } from "../src/glossary.js";
import { readGlossaryJson } from "../src/glossary-json-reader.js";
import { writeGlossaryJson } from "../src/glossary-json-writer.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { synonymAlias } from "../src/synonym-alias.js";
import { TERM_KINDS } from "../src/term-kind.js";
import { TERM_STATUSES } from "../src/term-status.js";

/** Any non-blank text, including the quotes and backslashes that break a naive writer. */
const text = fc.string({ minLength: 1, maxLength: 12 }).filter((value) => value.trim() !== "");

const contextName = fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/);

const isoDate = fc
  .date({
    min: new Date("2000-01-01T00:00:00.000Z"),
    max: new Date("2099-12-31T00:00:00.000Z"),
    noInvalidDate: true,
  })
  .map((value) => value.toISOString().slice(0, 10));

const contextArbitrary = fc.record({
  name: contextName,
  packages: fc.array(text, { maxLength: 3 }),
  description: fc.option(text, { nil: undefined }),
});

function termArbitrary(names: readonly string[]) {
  return fc.record({
    term: text,
    context: fc.constantFrom(...names),
    kind: fc.constantFrom(...TERM_KINDS),
    status: fc.constantFrom(...TERM_STATUSES),
    firstSeen: isoDate,
    definition: fc.option(text, { nil: undefined }),
    translations: fc.uniqueArray(fc.tuple(contextName, text), {
      maxLength: 3,
      selector: ([locale]) => locale,
    }),
    synonyms: fc.uniqueArray(fc.tuple(text, fc.option(text, { nil: undefined })), {
      maxLength: 3,
      selector: ([alias]) => alias,
    }),
    sources: fc.array(text, { maxLength: 3 }),
  });
}

type GeneratedTerm = ReturnType<typeof termArbitrary> extends fc.Arbitrary<infer T> ? T : never;

/** A model invariant, not a serialization concern: an alias may not be a term of its own context. */
function aliasesAreDisjoint(terms: readonly GeneratedTerm[]): boolean {
  return terms.every((term) =>
    term.synonyms.every(
      ([alias]) => !terms.some((other) => other.context === term.context && other.term === alias),
    ),
  );
}

/** Accepted shorthand: single tokens with non-blank expansions, as the model requires. */
const abbreviationsArbitrary = fc
  .uniqueArray(fc.tuple(fc.stringMatching(/^[a-z]{1,5}$/), text), {
    maxLength: 3,
    selector: ([abbreviation]) => abbreviation,
  })
  .map((entries) => new Map(entries));

const arbitraryGlossary: fc.Arbitrary<Glossary> = fc
  .uniqueArray(contextArbitrary, { minLength: 1, maxLength: 4, selector: (entry) => entry.name })
  .chain((contexts) =>
    fc
      .uniqueArray(termArbitrary(contexts.map((entry) => entry.name)), {
        maxLength: 6,
        selector: (entry) => `${entry.context}/${entry.term}`,
      })
      .filter(aliasesAreDisjoint)
      .chain((terms) =>
        abbreviationsArbitrary.map((abbreviations) => ({ contexts, terms, abbreviations })),
      ),
  )
  .map(({ contexts, terms, abbreviations }) =>
    glossary(
      1,
      new Map(
        contexts.map((entry) => [
          entry.name,
          boundedContext(entry.name, entry.packages, entry.description),
        ]),
      ),
      terms.map((entry) =>
        glossaryTerm({
          ...entry,
          translations: new Map(entry.translations),
          synonyms: entry.synonyms.map(([alias, note]) => synonymAlias(alias, note)),
        }),
      ),
      abbreviations,
    ),
  );

test("reading back a written glossary yields an identical model", () => {
  fc.assert(
    fc.property(arbitraryGlossary, (model) => {
      expect(readGlossaryJson(writeGlossaryJson(model))).toStrictEqual(model);
    }),
    { numRuns: 300 },
  );
});

test("serialization is stable: writing what was read reproduces the same bytes", () => {
  fc.assert(
    fc.property(arbitraryGlossary, (model) => {
      const once = writeGlossaryJson(model);

      expect(writeGlossaryJson(readGlossaryJson(once))).toBe(once);
    }),
    { numRuns: 300 },
  );
});

test("term order in the file never depends on the order terms were added", () => {
  fc.assert(
    fc.property(arbitraryGlossary, (model) => {
      const reversed = glossary(
        model.schemaVersion,
        model.contexts,
        [...model.terms].reverse(),
        model.abbreviations,
      );

      expect(writeGlossaryJson(reversed)).toBe(writeGlossaryJson(model));
    }),
    { numRuns: 200 },
  );
});

test("abbreviation order in the file never depends on the order they were added", () => {
  fc.assert(
    fc.property(arbitraryGlossary, (model) => {
      const reversed = glossary(
        model.schemaVersion,
        model.contexts,
        model.terms,
        [...model.abbreviations]
          .reverse()
          .reduce((map, [key, value]) => map.set(key, value), new Map<string, string>()),
      );

      expect(writeGlossaryJson(reversed)).toBe(writeGlossaryJson(model));
    }),
    { numRuns: 200 },
  );
});

test("the schema version follows what the glossary declares, not what the caller said", () => {
  fc.assert(
    fc.property(arbitraryGlossary, (model) => {
      expect(model.schemaVersion).toBe(model.abbreviations.size === 0 ? 1 : 2);
    }),
    { numRuns: 200 },
  );
});
