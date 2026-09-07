// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  parameterCapture,
  returned,
  type TraceNode,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "../src/glossary.js";
import { harvestStatic, harvestTraces } from "../src/glossary-harvester.js";

/** A glossary declaring one context, which is all harvesting reads from it. */
const BILLING = glossary(
  GLOSSARY_SCHEMA_VERSION,
  new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
  [],
);

/** Every class in these tests lives in billing unless a test says otherwise. */
const inBilling = () => "packages/billing/service.ts";

function call(
  className: string,
  methodName: string,
  parameters: readonly string[] = [],
  children: readonly TraceNode[] = [],
): TraceNode {
  return traceNode(
    methodSignature(
      className,
      methodName,
      parameters.map((name) => parameterCapture(name, "1", false)),
    ),
    returned(null),
    children,
  );
}

function harvestOf(node: TraceNode, sourcePathOf = inBilling) {
  return harvestTraces(BILLING, [traceTree([node])], sourcePathOf);
}

/** The `(phrase, kind)` pairs of a harvest, which is what most assertions are about. */
function phrases(candidates: ReturnType<typeof harvestTraces>) {
  return candidates.map((candidate) => `${candidate.kind}:${candidate.phrase}`);
}

describe("harvestTraces", () => {
  test("harvests the verb phrase and its object from a method name", () => {
    const harvest = harvestOf(call("OverdraftService", "openAccountWithOverdraft"));

    expect(phrases(harvest)).toContain("verb-phrase:open account with overdraft");
    expect(phrases(harvest)).toContain("noun-phrase:account with overdraft");
  });

  test("harvests the class stem, dropping its role suffix", () => {
    const harvest = harvestOf(call("OverdraftService", "openAccountWithOverdraft"));

    expect(phrases(harvest)).toContain("word:overdraft");
  });

  test("harvests parameter nouns, dropping the id role token", () => {
    const harvest = harvestOf(call("OverdraftService", "close", ["overdraftAccountId"]));

    expect(phrases(harvest)).toContain("noun-phrase:overdraft account");
  });

  test("harvests the exception stem of a call that threw", () => {
    class InsufficientFundsError extends Error {}
    const node = traceNode(
      methodSignature("OverdraftService", "charge", []),
      threw(new InsufficientFundsError("nope")),
      [],
    );

    expect(phrases(harvestOf(node))).toContain("noun-phrase:insufficient fund");
  });

  test("records the code site and identifier each phrase came from", () => {
    const harvest = harvestOf(call("OverdraftService", "openAccount"));
    const verb = harvest.find((candidate) => candidate.kind === "verb-phrase");

    expect(verb).toMatchObject({
      site: "OverdraftService.openAccount",
      identifier: "openAccount",
      context: "billing",
    });
  });

  test("resolves each observation to the context owning its source path", () => {
    const model = glossary(
      GLOSSARY_SCHEMA_VERSION,
      new Map([
        ["billing", boundedContext("billing", ["packages/billing"])],
        ["shipping", boundedContext("shipping", ["packages/shipping"])],
      ]),
      [],
    );
    const trees = [traceTree([call("InvoiceService", "raiseInvoice")])];
    const harvest = harvestTraces(model, trees, () => "packages/shipping/invoice-service.ts");

    expect(harvest.every((candidate) => candidate.context === "shipping")).toBe(true);
  });

  test("files an observation under _unassigned when no context claims its path", () => {
    const harvest = harvestOf(call("InvoiceService", "raiseInvoice"), () => "packages/other/x.ts");

    expect(harvest.every((candidate) => candidate.context === "_unassigned")).toBe(true);
  });

  test("files an observation under _unassigned when the source path is unknown", () => {
    const harvest = harvestOf(call("InvoiceService", "raiseInvoice"), () => undefined);

    expect(harvest.every((candidate) => candidate.context === "_unassigned")).toBe(true);
  });

  test("descends into child calls", () => {
    const node = call("OverdraftService", "openAccount", [], [call("LedgerRepository", "record")]);

    expect(phrases(harvestOf(node))).toContain("word:ledger");
  });

  test("counts repeated observations of the same phrase at the same site", () => {
    const child = call("LedgerRepository", "record");
    const node = call("OverdraftService", "openAccount", [], [child, child]);
    const ledger = harvestOf(node).find((candidate) => candidate.phrase === "ledger");

    expect(ledger?.occurrences).toBe(2);
  });

  test("keeps observations of one phrase at different sites apart", () => {
    const node = call(
      "OverdraftService",
      "openAccount",
      [],
      [call("LedgerRepository", "record"), call("LedgerService", "post")],
    );
    const ledger = harvestOf(node).filter((candidate) => candidate.phrase === "ledger");

    expect(ledger.map((candidate) => candidate.site)).toStrictEqual([
      "LedgerRepository",
      "LedgerService",
    ]);
  });

  test.each([
    ["angle-bracketed synthetic names", "<launcher>"],
    ["a name that does not start like an identifier", "9Lives"],
    ["a name carrying a character no identifier may hold", "Ledger-Repo"],
    // Security fuzz suite finding: these are syntactically legal identifiers — exactly what a
    // minifier, a Kotlin unused-parameter placeholder or a bundler rename produces — but they
    // tokenize to no word at all, which crashed the whole harvest (classCandidate's declared
    // guard threw, uncaught) before the filter also required a letter or digit somewhere.
    ["a lone underscore", "_"],
    ["a lone dollar sign", "$"],
    ["underscores with nothing between them", "__"],
  ])("skips %s", (_case, name) => {
    expect(harvestOf(call(name, name, [name]))).toStrictEqual([]);
  });

  test("harvests a name that carries a digit", () => {
    const harvest = harvestOf(call("Ledger2Service", "record"));

    expect(phrases(harvest)).toContain("noun-phrase:ledger 2");
  });

  test("records nothing for identifiers that normalize to no phrase at all", () => {
    const harvest = harvestOf(call("Service", "run", ["id"]));

    expect(phrases(harvest)).toStrictEqual(["verb-phrase:run"]);
  });

  test("records nothing for an exception type that is only its own suffix", () => {
    const node = traceNode(methodSignature("Ledger", "post", []), threw(new Error("nope")), []);

    expect(phrases(harvestOf(node))).toStrictEqual(["word:ledger", "verb-phrase:post"]);
  });

  test.each([
    ["a thrown string, which names no type", "boom"],
    ["a thrown null", null],
    ["a thrown object with no prototype", Object.create(null)],
  ])("harvests no exception vocabulary from %s", (_case, error) => {
    const node = traceNode(methodSignature("Ledger", "post", []), threw(error), []);

    expect(phrases(harvestOf(node))).toStrictEqual(["word:ledger", "verb-phrase:post"]);
  });

  test("orders one phrase by kind as the taxonomy declares it, whatever order it was seen in", () => {
    // "charge" is seen as a verb phrase first and as a word second, so the canonical order — word
    // before verb phrase — can only come out right if the comparator actually reorders them.
    const node = call("Ledger", "charge", [], [call("Charge", "open")]);

    expect(phrases(harvestOf(node))).toStrictEqual([
      "word:charge",
      "verb-phrase:charge",
      "word:ledger",
      "verb-phrase:open",
    ]);
  });

  test("orders two identifiers that agree on everything but their spelling", () => {
    // A method and one of its own parameters can normalize to the same phrase and kind at the same
    // site. Java leaves that pair unordered; ordering it on the identifier is what makes the
    // harvest independent of traversal accidents.
    const harvest = harvestOf(call("Ledger", "ledger", ["ledgerId"]));

    expect(harvest.map((candidate) => candidate.identifier)).toStrictEqual([
      "Ledger",
      "ledger",
      "ledgerId",
    ]);
  });

  test("files an observation under _unassigned when the source path is blank", () => {
    const harvest = harvestOf(call("InvoiceService", "raiseInvoice"), () => "   ");

    expect(harvest.every((candidate) => candidate.context === "_unassigned")).toBe(true);
  });

  test("harvests nothing from an empty forest", () => {
    expect(harvestTraces(BILLING, [], inBilling)).toStrictEqual([]);
  });
});

describe("harvestStatic", () => {
  function narratedCall(narration?: string, errorContext?: string): TraceNode {
    return traceNode(
      methodSignature("OverdraftService", "charge", [], { narration, errorContext }),
      returned(null),
      [],
    );
  }

  function staticHarvestOf(node: TraceNode) {
    return harvestStatic(BILLING, [traceTree([node])], inBilling);
  }

  test("harvests the narration template as a template term", () => {
    const harvest = staticHarvestOf(narratedCall("Charges {amount} to {account}"));

    expect(phrases(harvest)).toContain("template:Charges {amount} to {account}");
  });

  test("harvests the error-context template beside the narration one", () => {
    const harvest = staticHarvestOf(narratedCall("Charges {amount}", "Could not charge {amount}"));

    expect(phrases(harvest)).toContain("template:Charges {amount}");
    expect(phrases(harvest)).toContain("template:Could not charge {amount}");
  });

  test("records a template verbatim, placeholders and casing intact", () => {
    const harvest = staticHarvestOf(narratedCall("Charges {amount} to Accounts"));
    const template = harvest.find((candidate) => candidate.kind === "template");

    // Normalizing would lowercase the text and singularize "Accounts" — destroying the very
    // placeholders and wording a per-locale variant has to key on.
    expect(template).toMatchObject({
      phrase: "Charges {amount} to Accounts",
      identifier: "Charges {amount} to Accounts",
      site: "OverdraftService.charge",
      context: "billing",
      occurrences: 1,
    });
  });

  test("harvests everything trace mode harvests, and the templates too", () => {
    const node = narratedCall("Charges {amount}");
    const trees = [traceTree([node])];

    const staticHarvest = phrases(harvestStatic(BILLING, trees, inBilling));

    // A template is ordered by its own text like any other phrase, not appended to the end, so
    // the two modes differ only by which entries exist — never by how the rest are ordered.
    expect(staticHarvest.filter((phrase) => !phrase.startsWith("template:"))).toStrictEqual(
      phrases(harvestTraces(BILLING, trees, inBilling)),
    );
    expect(staticHarvest).toContain("template:Charges {amount}");
  });

  test("trace mode never harvests a template, even from a signature carrying one", () => {
    const harvest = harvestOf(narratedCall("Charges {amount}", "Could not charge {amount}"));

    expect(harvest.some((candidate) => candidate.kind === "template")).toBe(false);
  });

  test.each([
    ["an absent template", undefined],
    ["an empty template", ""],
    ["a whitespace-only template", "   "],
  ])("harvests no template term from %s", (_case, narration) => {
    const harvest = staticHarvestOf(narratedCall(narration));

    expect(harvest.some((candidate) => candidate.kind === "template")).toBe(false);
  });

  test("counts a template repeated at the same site", () => {
    const child = traceNode(
      methodSignature("LedgerRepository", "record", [], { narration: "Records {entry}" }),
      returned(null),
      [],
    );
    const root = traceNode(methodSignature("Ledger", "post", []), returned(null), [child, child]);
    const harvest = harvestStatic(BILLING, [traceTree([root])], inBilling);

    expect(harvest.find((candidate) => candidate.kind === "template")?.occurrences).toBe(2);
  });

  test("harvests a template from a node whose class name is not an identifier", () => {
    // Parity with the Java runtime: the identifier filter guards the *normalized* vocabulary,
    // and a template is never normalized. A synthetic node that carries narration still names a
    // template worth translating, so it is kept even though its class contributes no noun.
    const node = traceNode(
      methodSignature("<launcher>", "9run", [], { narration: "Starts {app}" }),
      returned(null),
      [],
    );

    expect(phrases(harvestStatic(BILLING, [traceTree([node])], inBilling))).toStrictEqual([
      "template:Starts {app}",
    ]);
  });

  test("harvests nothing from an empty forest", () => {
    expect(harvestStatic(BILLING, [], inBilling)).toStrictEqual([]);
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot(): TraceNode {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned(null),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as TraceNode;
  }

  function deepChain(length: number): TraceNode {
    let node = traceNode(methodSignature("Leaf", "op", []), returned(null), []);
    for (let i = 0; i < length; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned(null), [node]);
    }
    return node;
  }

  test("harvestTraces does not crash on a cyclic tree", () => {
    expect(() => harvestOf(cyclicRoot())).not.toThrow();
  });

  test("harvestTraces does not stack-overflow on a very deep chain", () => {
    expect(() => harvestOf(deepChain(50_000))).not.toThrow();
  });
});
