// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { glossaryTerm } from "../src/glossary-term.js";
import { renderGlossaryUsageReport } from "../src/glossary-usage-report.js";
import { type HarvestCandidate, harvestCandidate } from "../src/harvest-candidate.js";
import { vocabularyViolation } from "../src/vocabulary-violation.js";

function observed(overrides: Partial<HarvestCandidate> = {}): HarvestCandidate {
  return harvestCandidate({
    context: "billing",
    phrase: "overdraft account",
    kind: "noun-phrase",
    site: "OverdraftService.open",
    identifier: "open",
    occurrences: 1,
    ...overrides,
  });
}

const NEW_TERM = glossaryTerm({
  term: "overdraft account",
  context: "billing",
  kind: "noun-phrase",
  status: "harvested",
  firstSeen: "2026-08-13",
});

const VIOLATION = vocabularyViolation({
  context: "billing",
  alias: "account with overdraft",
  canonicalTerm: "overdraft account",
  site: "OverdraftService.openAccountWithOverdraft",
  identifier: "openAccountWithOverdraft",
  suggestedIdentifier: "openOverdraftAccount",
  occurrences: 2,
});

describe("renderGlossaryUsageReport", () => {
  test("renders what the run added, what it violated, and what it saw", () => {
    const report = renderGlossaryUsageReport([observed()], [NEW_TERM], [VIOLATION]);

    expect(report).toBe(
      `{
  "newTerms": [
    { "term": "overdraft account", "context": "billing" }
  ],
  "violations": [
    { "context": "billing", "alias": "account with overdraft", "canonicalTerm": "overdraft account", "site": "OverdraftService.openAccountWithOverdraft", "identifier": "openAccountWithOverdraft", "suggestedIdentifier": "openOverdraftAccount", "occurrences": 2 }
  ],
  "usage": [
    { "context": "billing", "phrase": "overdraft account", "occurrences": 1 }
  ]
}
`,
    );
  });

  test("renders empty sections for a run that harvested nothing", () => {
    expect(renderGlossaryUsageReport([], [], [])).toBe(
      '{\n  "newTerms": [],\n  "violations": [],\n  "usage": []\n}\n',
    );
  });

  test("omits the suggestion of a violation that has no mechanical rename", () => {
    const { suggestedIdentifier: _none, ...unrenameable } = VIOLATION;

    const report = renderGlossaryUsageReport([], [], [vocabularyViolation(unrenameable)]);

    expect(report).not.toContain("suggestedIdentifier");
    expect(report).toContain('"identifier": "openAccountWithOverdraft", "occurrences": 2');
  });

  test("totals usage per phrase across the sites and kinds it was seen at", () => {
    const harvest = [
      observed({ occurrences: 2 }),
      observed({ site: "Other.close", kind: "verb-phrase", occurrences: 3 }),
    ];

    expect(renderGlossaryUsageReport(harvest, [], [])).toContain(
      '{ "context": "billing", "phrase": "overdraft account", "occurrences": 5 }',
    );
  });

  test("keeps one phrase per context, in the order the harvest was given", () => {
    const harvest = [
      observed({ context: "shipping", phrase: "parcel" }),
      observed(),
      observed({ context: "shipping", phrase: "parcel", site: "B.b" }),
    ];

    const usage = renderGlossaryUsageReport(harvest, [], [])
      .split("\n")
      .filter((line) => line.includes('"phrase"'));

    expect(usage).toStrictEqual([
      '    { "context": "shipping", "phrase": "parcel", "occurrences": 2 },',
      '    { "context": "billing", "phrase": "overdraft account", "occurrences": 1 }',
    ]);
  });

  test("escapes text that would otherwise break the document", () => {
    const quoted = observed({ phrase: 'say "hi"\\' });

    const report = renderGlossaryUsageReport([quoted], [], []);

    expect(report).toContain('"phrase": "say \\"hi\\"\\\\"');
    expect(JSON.parse(report)).toMatchObject({ usage: [{ phrase: 'say "hi"\\' }] });
  });

  test("emits a document that parses, ending in exactly one newline", () => {
    const report = renderGlossaryUsageReport([observed()], [NEW_TERM], [VIOLATION]);

    expect(() => JSON.parse(report)).not.toThrow();
    expect(report.endsWith("}\n")).toBe(true);
  });
});
