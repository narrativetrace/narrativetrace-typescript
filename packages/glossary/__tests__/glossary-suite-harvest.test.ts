// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  returned,
  type TraceTree,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "../src/glossary.js";
import { writeGlossaryJson } from "../src/glossary-json-writer.js";
import { runGlossaryHarvest } from "../src/glossary-suite-harvest.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { NON_CANONICAL_TERM } from "../src/non-canonical-term-issues.js";
import { synonymAlias } from "../src/synonym-alias.js";

/**
 * A glossary declaring one context, as a repository would commit it. Built through the writer
 * rather than hand-written, so the fixture cannot drift from the canonical file format.
 */
const COMMITTED = writeGlossaryJson(
  glossary(
    GLOSSARY_SCHEMA_VERSION,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
    [],
  ),
);

/** A run against the committed fixture, which is what most tests are about. */
function harvestOf(trees: readonly TraceTree[]) {
  return runGlossaryHarvest({
    existingJson: COMMITTED,
    trees,
    sourcePathOf: inBilling,
    firstSeen: "2026-08-13",
  });
}

/** Every class in these tests lives in billing. */
const inBilling = () => "packages/billing/overdraft-service.ts";

function scenario(methodName: string, narration?: string): TraceTree {
  return traceTree([
    traceNode(
      methodSignature("OverdraftService", methodName, [], { narration }),
      returned(null),
      [],
    ),
  ]);
}

describe("runGlossaryHarvest", () => {
  test("returns the merged glossary as the JSON to commit", () => {
    const artifacts = runGlossaryHarvest({
      existingJson: COMMITTED,
      trees: [scenario("openAccount")],
      sourcePathOf: inBilling,
      firstSeen: "2026-08-13",
    });

    expect(JSON.parse(artifacts.glossaryJson).terms).toMatchObject([
      { term: "account", context: "billing", status: "harvested", firstSeen: "2026-08-13" },
      { term: "open account", context: "billing", kind: "verb-phrase" },
      { term: "overdraft", context: "billing", kind: "word" },
    ]);
  });

  test("renders the Markdown view of the same glossary", () => {
    const artifacts = harvestOf([scenario("openAccount")]);

    expect(artifacts.glossaryMarkdown).toContain("open account");
    expect(artifacts.glossaryMarkdown).toContain("billing");
  });

  test("reports what the run observed in the usage report", () => {
    const artifacts = harvestOf([scenario("openAccount")]);

    expect(JSON.parse(artifacts.usageReport)).toMatchObject({
      newTerms: [{ term: "account" }, { term: "open account" }, { term: "overdraft" }],
      violations: [],
      usage: [
        { context: "billing", phrase: "account", occurrences: 1 },
        { context: "billing", phrase: "open account", occurrences: 1 },
        { context: "billing", phrase: "overdraft", occurrences: 1 },
      ],
    });
  });

  test("summarizes the run for the console", () => {
    const artifacts = harvestOf([scenario("openAccount")]);

    expect(artifacts.summary).toBe("Vocabulary: 3 new terms harvested");
  });

  test("starts from an empty glossary when the repository has committed none", () => {
    const artifacts = runGlossaryHarvest({
      trees: [scenario("openAccount")],
      sourcePathOf: inBilling,
      firstSeen: "2026-08-13",
    });

    // No context is declared, so everything the first run of a repository sees is unassigned —
    // and the merge declares `_unassigned` itself, so the written file is still a valid glossary.
    const written = JSON.parse(artifacts.glossaryJson);
    expect(written.schemaVersion).toBe(GLOSSARY_SCHEMA_VERSION);
    expect(Object.keys(written.contexts)).toStrictEqual(["_unassigned"]);
    expect(written.terms.every((term: { context: string }) => term.context === "_unassigned")).toBe(
      true,
    );
  });

  test("harvests a narration template in static mode only", () => {
    const trees = [scenario("charge", "Charges {amount} to {account}")];
    const templates = (mode: "trace" | "static") =>
      JSON.parse(
        runGlossaryHarvest({
          existingJson: COMMITTED,
          trees,
          sourcePathOf: inBilling,
          firstSeen: "2026-08-13",
          mode,
        }).glossaryJson,
      ).terms.filter((term: { kind: string }) => term.kind === "template");

    expect(templates("static")).toMatchObject([{ term: "Charges {amount} to {account}" }]);
    expect(templates("trace")).toStrictEqual([]);
  });

  test("defaults to the trace mode that must never read a template", () => {
    const artifacts = harvestOf([scenario("charge", "Charges {amount}")]);

    expect(artifacts.glossaryJson).not.toContain("{amount}");
  });

  test("reports a deprecated synonym on every surface at once", () => {
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

    const artifacts = runGlossaryHarvest({
      existingJson: committed,
      trees: [scenario("openAccountWithOverdraft")],
      sourcePathOf: inBilling,
      firstSeen: "2026-08-13",
    });

    expect(artifacts.summary).toContain("1 deprecated synonym in use");
    expect(artifacts.issues).toMatchObject([
      {
        category: NON_CANONICAL_TERM,
        element: "billing.OverdraftService.openAccountWithOverdraft",
      },
    ]);
    expect(JSON.parse(artifacts.usageReport).violations).toMatchObject([
      { alias: "account with overdraft", canonicalTerm: "overdraft account" },
    ]);
    // Suppressed, not merged: a deprecated alias must never become a term of its own.
    expect(
      JSON.parse(artifacts.glossaryJson).terms.map((term: { term: string }) => term.term),
    ).not.toContain("account with overdraft");
  });

  test("leaves the committed glossary byte-identical when a run changes no vocabulary", () => {
    const first = harvestOf([scenario("openAccount")]);

    const second = runGlossaryHarvest({
      existingJson: first.glossaryJson,
      trees: [scenario("openAccount")],
      sourcePathOf: inBilling,
      // A different date on the second run, so a silently re-created entry could not hide.
      firstSeen: "2026-09-01",
    });

    expect(second.glossaryJson).toBe(first.glossaryJson);
    expect(second.summary).toBe("Vocabulary: 0 new terms harvested");
  });

  test("still reports what an unchanged run observed", () => {
    const first = harvestOf([scenario("openAccount")]);

    const second = runGlossaryHarvest({
      existingJson: first.glossaryJson,
      trees: [scenario("openAccount")],
      sourcePathOf: inBilling,
      firstSeen: "2026-09-01",
    });

    // Anti-churn governs the committed file only — the volatile report still has the evidence.
    expect(JSON.parse(second.usageReport)).toMatchObject({
      newTerms: [],
      usage: [
        { phrase: "account", occurrences: 1 },
        { phrase: "open account", occurrences: 1 },
        { phrase: "overdraft", occurrences: 1 },
      ],
    });
  });

  test("harvests nothing from a run that captured no traces", () => {
    const artifacts = runGlossaryHarvest({
      existingJson: COMMITTED,
      trees: [],
      sourcePathOf: inBilling,
      firstSeen: "2026-08-13",
    });

    expect(artifacts.glossaryJson).toBe(COMMITTED);
    expect(artifacts.summary).toBe("Vocabulary: 0 new terms harvested");
    expect(artifacts.issues).toStrictEqual([]);
  });

  test("fails loudly on a committed glossary that cannot be read", () => {
    // Silently starting from empty would drop every curated definition in the repository and then
    // rewrite the file without them — the most destructive thing this function could do.
    expect(() =>
      runGlossaryHarvest({
        existingJson: '{"schemaVersion": 1, "contexts": {}, "oops": []}',
        trees: [],
        sourcePathOf: inBilling,
        firstSeen: "2026-08-13",
      }),
    ).toThrow("unknown key 'oops'");
  });

  test("rejects a firstSeen date that is not an ISO calendar date", () => {
    expect(() =>
      runGlossaryHarvest({
        existingJson: COMMITTED,
        trees: [scenario("openAccount")],
        sourcePathOf: inBilling,
        firstSeen: "13/08/2026",
      }),
    ).toThrow("firstSeen");
  });
});
