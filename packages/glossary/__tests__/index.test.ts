// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { methodSignature, returned, traceNode, traceTree } from "@narrativetrace/core";
import { expect, test } from "vitest";
import {
  aliasIndex,
  boundedContext,
  collectViolations,
  formatVocabularySummary,
  GLOSSARY_ABBREVIATIONS_SCHEMA_VERSION,
  GLOSSARY_SCHEMA_VERSION,
  glossary,
  glossaryTerm,
  glossaryTranslator,
  harvestStatic,
  harvestTraces,
  isTermKind,
  isTermStatus,
  mergeHarvest,
  methodCandidates,
  NON_CANONICAL_TERM,
  nonCanonicalTermIssues,
  normalizePhrase,
  readGlossaryJson,
  renderGlossaryMarkdown,
  renderGlossaryUsageReport,
  resolveContext,
  runGlossaryHarvest,
  synonymAlias,
  TERM_KINDS,
  TERM_STATUSES,
  UNASSIGNED_CONTEXT,
  writeGlossaryJson,
} from "../src/index.js";

test("barrel exports are accessible", () => {
  expect(typeof boundedContext).toBe("function");
  expect(typeof synonymAlias).toBe("function");
  expect(typeof glossaryTerm).toBe("function");
  expect(typeof glossary).toBe("function");
  expect(typeof isTermKind).toBe("function");
  expect(typeof isTermStatus).toBe("function");
});

test("barrel assembles a whole glossary from its exported parts", () => {
  const model = glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
    [
      glossaryTerm({
        term: "overdraft account",
        context: "billing",
        kind: "noun-phrase",
        status: "curated",
        firstSeen: "2026-08-13",
        synonyms: [synonymAlias("account with overdraft")],
      }),
    ],
  );

  expect(model.schemaVersion).toBe(1);
  expect(model.terms[0]?.synonyms[0]?.alias).toBe("account with overdraft");
});

test("barrel round-trips a glossary through its writer and reader", () => {
  const model = glossary(GLOSSARY_SCHEMA_VERSION, new Map(), []);

  expect(readGlossaryJson(writeGlossaryJson(model))).toStrictEqual(model);
});

test("barrel round-trips a glossary that declares accepted shorthand", () => {
  const model = glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map(),
    [],
    new Map([["fx", "foreign exchange"]]),
  );

  expect(model.schemaVersion).toBe(GLOSSARY_ABBREVIATIONS_SCHEMA_VERSION);
  expect(readGlossaryJson(writeGlossaryJson(model))).toStrictEqual(model);
});

test("barrel-exported factories build the same records as their modules", () => {
  expect(boundedContext("billing", ["packages/billing"]).name).toBe("billing");
  expect(synonymAlias("account with overdraft").alias).toBe("account with overdraft");
  expect(
    glossaryTerm({
      term: "overdraft account",
      context: "billing",
      kind: "noun-phrase",
      status: "harvested",
      firstSeen: "2026-08-13",
    }).term,
  ).toBe("overdraft account");
});

test("barrel exposes the taxonomies the JSON labels are drawn from", () => {
  expect(TERM_KINDS).toStrictEqual(["word", "noun-phrase", "verb-phrase", "template"]);
  expect(TERM_STATUSES).toStrictEqual(["harvested", "curated", "stale"]);
  expect(isTermKind("noun-phrase")).toBe(true);
  expect(isTermKind("phrase")).toBe(false);
  expect(isTermStatus("curated")).toBe(true);
  expect(isTermStatus("reviewed")).toBe(false);
});

test("barrel renders the Markdown review view", () => {
  const model = glossary(GLOSSARY_SCHEMA_VERSION, new Map(), []);

  expect(renderGlossaryMarkdown(model)).toContain("# Domain Glossary");
});

test("barrel normalizes an identifier into harvest candidates", () => {
  expect(methodCandidates("openOverdraftAccount")).toStrictEqual([
    { phrase: "open overdraft account", kind: "verb-phrase" },
    { phrase: "overdraft account", kind: "noun-phrase" },
  ]);
});

test("barrel resolves a source path to its bounded context", () => {
  const model = glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
    [],
  );

  expect(resolveContext(model, "packages/billing/overdraft.ts")).toBe("billing");
  expect(resolveContext(model, "packages/billingx/other.ts")).toBe(UNASSIGNED_CONTEXT);
});

test("barrel harvests a trace and merges it into a glossary, end to end", () => {
  const model = glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
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
  const trace = traceTree([
    traceNode(
      methodSignature("OverdraftService", "openAccountWithOverdraft", []),
      returned(null),
      [],
    ),
  ]);

  const harvest = harvestTraces(model, [trace], () => "packages/billing/overdraft-service.ts");
  const merged = mergeHarvest(model, harvest, "2026-08-13");

  expect(aliasIndex(model).canonicalFor("billing", "account with overdraft")?.term).toBe(
    "overdraft account",
  );
  expect(merged.suppressedAliasUses.map((use) => use.phrase)).toStrictEqual([
    "account with overdraft",
  ]);
  expect(merged.newTerms.map((term) => term.term)).toStrictEqual([
    "open account with overdraft",
    "overdraft",
  ]);
  expect(merged.glossary.terms.find((term) => term.term === "overdraft account")?.status).toBe(
    "curated",
  );
});

test("barrel reports a run's vocabulary violations on every surface", () => {
  const model = glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
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
  const trace = traceTree([
    traceNode(
      methodSignature("OverdraftService", "openAccountWithOverdraft", []),
      returned(null),
      [],
    ),
  ]);
  const harvest = harvestTraces(model, [trace], () => "packages/billing/overdraft-service.ts");
  const merged = mergeHarvest(model, harvest, "2026-08-13");

  const violations = collectViolations(model, merged.suppressedAliasUses);

  expect(violations.map((violation) => violation.suggestedIdentifier)).toStrictEqual([
    "openOverdraftAccount",
  ]);
  expect(formatVocabularySummary(merged.newTerms.length, violations)).toBe(
    [
      "Vocabulary: 2 new terms harvested, 1 deprecated synonym in use",
      '  openAccountWithOverdraft → use openOverdraftAccount (billing: "overdraft account")',
    ].join("\n"),
  );
  expect(nonCanonicalTermIssues(violations)[0]).toMatchObject({
    category: NON_CANONICAL_TERM,
    element: "billing.OverdraftService.openAccountWithOverdraft",
    severity: "MEDIUM",
  });
  expect(JSON.parse(renderGlossaryUsageReport(harvest, merged.newTerms, violations))).toMatchObject(
    {
      newTerms: [{ term: "open account with overdraft" }, { term: "overdraft" }],
      violations: [{ alias: "account with overdraft", canonicalTerm: "overdraft account" }],
    },
  );
});

test("barrel harvests a narration template into the glossary as a template term", () => {
  const model = glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
    [],
  );
  const scanned = traceTree([
    traceNode(
      methodSignature("OverdraftService", "charge", [], {
        narration: "Charges {amount} to {account}",
      }),
      returned(null),
      [],
    ),
  ]);

  const harvest = harvestStatic(model, [scanned], () => "packages/billing/overdraft-service.ts");
  const merged = mergeHarvest(model, harvest, "2026-08-13");

  expect(merged.glossary.terms.find((term) => term.kind === "template")).toMatchObject({
    term: "Charges {amount} to {account}",
    context: "billing",
    status: "harvested",
  });
});

test("barrel runs one whole harvest, from committed JSON to every artifact", () => {
  const committed = writeGlossaryJson(
    glossary(
      GLOSSARY_SCHEMA_VERSION,
      new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
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
    ),
  );
  const trace = traceTree([
    traceNode(
      methodSignature("OverdraftService", "openAccountWithOverdraft", []),
      returned(null),
      [],
    ),
  ]);

  const artifacts = runGlossaryHarvest({
    existingJson: committed,
    trees: [trace],
    sourcePathOf: () => "packages/billing/overdraft-service.ts",
    firstSeen: "2026-08-13",
  });

  expect(readGlossaryJson(artifacts.glossaryJson).terms.map((term) => term.term)).toStrictEqual([
    "open account with overdraft",
    "overdraft",
    "overdraft account",
  ]);
  expect(artifacts.glossaryMarkdown).toContain("overdraft account");
  expect(artifacts.summary).toContain("1 deprecated synonym in use");
  expect(artifacts.issues.map((issue) => issue.category)).toStrictEqual([NON_CANONICAL_TERM]);
  expect(JSON.parse(artifacts.usageReport).violations).toMatchObject([
    { alias: "account with overdraft" },
  ]);
});

test("barrel translates a harvested phrase into a curated locale", () => {
  const model = glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
    [
      glossaryTerm({
        term: "insufficient fund",
        context: "billing",
        kind: "noun-phrase",
        status: "curated",
        firstSeen: "2026-01-01",
        translations: new Map([["es", "fondos insuficientes"]]),
      }),
    ],
  );

  const translator = glossaryTranslator(model, "es");

  expect(translator.translate("billing", normalizePhrase("InsufficientFunds"))).toStrictEqual({
    text: "fondos insuficientes",
    translated: true,
  });
  expect(translator.translate("billing", "overdraft account").translated).toBe(false);
});
