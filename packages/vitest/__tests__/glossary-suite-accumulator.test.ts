// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  parameterCapture,
  returned,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core-node";
import {
  boundedContext,
  GLOSSARY_SCHEMA_VERSION,
  glossary,
  glossaryTerm,
  harvestTraces,
  synonymAlias,
  writeGlossaryJson,
} from "@narrativetrace/glossary";
import { describe, expect, test } from "vitest";
import {
  collectGlossarySites,
  rebuildTrees,
  traceSites,
  writeSuiteGlossary,
} from "../src/glossary-suite-accumulator.js";

describe("traceSites", () => {
  test("flattens a call into the vocabulary a harvest reads from it", () => {
    const tree = traceTree([
      traceNode(
        methodSignature("OverdraftService", "openAccount", [
          parameterCapture("customerId", "c-1", false),
        ]),
        returned(null),
        [],
      ),
    ]);

    expect(traceSites(tree)).toStrictEqual([
      { className: "OverdraftService", methodName: "openAccount", parameters: ["customerId"] },
    ]);
  });

  test("descends into child calls", () => {
    const child = traceNode(methodSignature("LedgerRepository", "record", []), returned(null), []);
    const tree = traceTree([
      traceNode(methodSignature("OverdraftService", "openAccount", []), returned(null), [child]),
    ]);

    expect(traceSites(tree).map((site) => site.className)).toStrictEqual([
      "OverdraftService",
      "LedgerRepository",
    ]);
  });

  test("carries a thrown value's type name, which a serialized error would lose", () => {
    class InsufficientFundsError extends Error {}
    const tree = traceTree([
      traceNode(
        methodSignature("OverdraftService", "charge", []),
        threw(new InsufficientFundsError("nope")),
        [],
      ),
    ]);

    expect(traceSites(tree)[0]?.errorType).toBe("InsufficientFundsError");
  });

  test.each([
    ["a thrown string, which names no type", "boom"],
    ["a thrown null", null],
  ])("carries no error type for %s", (_case, error) => {
    const tree = traceTree([traceNode(methodSignature("Ledger", "post", []), threw(error), [])]);

    expect(traceSites(tree)[0]).not.toHaveProperty("errorType");
  });

  test("carries no value a run happened to see", () => {
    const tree = traceTree([
      traceNode(
        methodSignature("OverdraftService", "charge", [
          parameterCapture("amount", "9999.99", false),
        ]),
        returned("secret-account-id"),
        [],
      ),
    ]);

    expect(JSON.stringify(traceSites(tree))).not.toContain("9999.99");
    expect(JSON.stringify(traceSites(tree))).not.toContain("secret-account-id");
  });

  test("flattens an empty trace to nothing", () => {
    expect(traceSites(traceTree([]))).toStrictEqual([]);
  });

  // A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents
  // it. Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding.
  test("does not crash on a cyclic tree", () => {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned(null),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    expect(() =>
      traceSites(traceTree([self as unknown as ReturnType<typeof traceNode>])),
    ).not.toThrow();
  });

  test("does not stack-overflow on a very deep chain", () => {
    let node = traceNode(methodSignature("Leaf", "op", []), returned(null), []);
    for (let i = 0; i < 50_000; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned(null), [node]);
    }
    expect(() => traceSites(traceTree([node]))).not.toThrow();
  });
});

describe("rebuildTrees", () => {
  test("rebuilds sites into trees a harvest reads the same vocabulary from", () => {
    const original = traceTree([
      traceNode(
        methodSignature("OverdraftService", "openAccount", [
          parameterCapture("customerId", "c-1", false),
        ]),
        returned(null),
        [
          traceNode(
            methodSignature("LedgerRepository", "record", []),
            threw(new RangeError("nope")),
            [],
          ),
        ],
      ),
    ]);
    const model = glossary(
      GLOSSARY_SCHEMA_VERSION,
      new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
      [],
    );
    const inBilling = () => "packages/billing/overdraft-service.ts";

    const roundTripped = harvestTraces(model, rebuildTrees(traceSites(original)), inBilling);

    // The whole point of the projection: what a harvest sees must survive the trip unchanged.
    expect(roundTripped).toStrictEqual(harvestTraces(model, [original], inBilling));
  });

  test("rebuilds no roots at all from an empty suite", () => {
    expect(rebuildTrees([])[0]?.roots).toStrictEqual([]);
  });
});

/** An in-memory repository so the suite harvest is exercised without a filesystem. */
function fakeSink(existing: Record<string, string> = {}) {
  const written: Record<string, string> = { ...existing };
  return {
    written,
    sink: {
      mkdir: () => {},
      writeFile: (path: string, content: string) => {
        written[path] = content;
      },
      fileExists: (path: string) => path in written,
      readFile: (path: string) => written[path] as string,
    },
  };
}

const CONFIG = { glossaryDir: ".", outputDir: "out", today: "2026-08-13" };

const SITE = {
  className: "OverdraftService",
  methodName: "openAccount",
  parameters: ["customerId"],
};

describe("collectGlossarySites", () => {
  test("collects every test's sites in file-then-test order", () => {
    const files = [
      {
        tasks: [
          { meta: { narrativeGlossary: [SITE] } },
          { meta: { narrativeGlossary: [{ ...SITE, methodName: "closeAccount" }] } },
        ],
      },
    ];

    expect(collectGlossarySites(files).map((site) => site.methodName)).toStrictEqual([
      "openAccount",
      "closeAccount",
    ]);
  });

  test("collects from nested suites", () => {
    const files = [{ tasks: [{ tasks: [{ meta: { narrativeGlossary: [SITE] } }] }] }];

    expect(collectGlossarySites(files)).toHaveLength(1);
  });

  test("collects nothing from tests that recorded nothing", () => {
    expect(collectGlossarySites([{ tasks: [{ meta: {} }, {}] }])).toStrictEqual([]);
  });

  test("collects nothing from an empty run", () => {
    expect(collectGlossarySites([])).toStrictEqual([]);
  });
});

describe("writeSuiteGlossary", () => {
  test("writes the committed pair and the volatile report", () => {
    const fake = fakeSink();

    const outcome = writeSuiteGlossary([SITE], CONFIG, fake.sink);

    expect(outcome.written).toBe(true);
    expect(Object.keys(fake.written).sort()).toStrictEqual([
      "./glossary.json",
      "./glossary.md",
      "out/glossary-usage.json",
    ]);
  });

  test("writes nothing at all when the suite observed nothing", () => {
    const fake = fakeSink();

    // A suite with no traced code must never rewrite a committed glossary with an empty one.
    expect(writeSuiteGlossary([], CONFIG, fake.sink)).toStrictEqual({ written: false, issues: [] });
    expect(fake.written).toStrictEqual({});
  });

  test("merges into the glossary the repository already committed", () => {
    const committed = writeGlossaryJson(
      glossary(
        GLOSSARY_SCHEMA_VERSION,
        new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
        [],
      ),
    );
    const fake = fakeSink({ "./glossary.json": committed });

    writeSuiteGlossary(
      [SITE],
      { ...CONFIG, sourcePathOf: () => "packages/billing/o.ts" },
      fake.sink,
    );

    expect(JSON.parse(fake.written["./glossary.json"] as string).terms[0].context).toBe("billing");
  });

  test("files every term under _unassigned when no source layout is known", () => {
    const fake = fakeSink();

    writeSuiteGlossary([SITE], CONFIG, fake.sink);

    const terms = JSON.parse(fake.written["./glossary.json"] as string).terms;
    expect(terms.every((term: { context: string }) => term.context === "_unassigned")).toBe(true);
  });

  test("hands back the summary and the run's vocabulary issues", () => {
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
    const fake = fakeSink({ "./glossary.json": committed });

    const outcome = writeSuiteGlossary(
      [{ ...SITE, methodName: "openAccountWithOverdraft" }],
      { ...CONFIG, sourcePathOf: () => "packages/billing/o.ts" },
      fake.sink,
    );

    expect(outcome.summary).toContain("1 deprecated synonym in use");
    expect(outcome.issues.map((issue) => issue.category)).toStrictEqual(["non-canonical-term"]);
  });

  test("leaves a committed glossary byte-identical when a run changes no vocabulary", () => {
    const fake = fakeSink();
    writeSuiteGlossary([SITE], CONFIG, fake.sink);
    const first = fake.written["./glossary.json"];

    writeSuiteGlossary([SITE], { ...CONFIG, today: "2026-09-01" }, fake.sink);

    expect(fake.written["./glossary.json"]).toBe(first);
  });
});
