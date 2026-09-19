// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  parameterCapture,
  type TraceNode,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { analyzeClarity } from "../src/clarity-analyzer.js";
import { domainVocabulary } from "../src/domain-vocabulary.js";

function node(
  className: string,
  methodName: string,
  params: string[],
  children: ReturnType<typeof traceNode>[] = [],
) {
  return traceNode(
    methodSignature(
      className,
      methodName,
      params.map((p) => parameterCapture(p, `"value"`, false)),
    ),
    { kind: "returned", renderedValue: null },
    children,
  );
}

function makeTree(methods: { className: string; methodName: string; params: string[] }[]) {
  const nodes = methods.map((m) =>
    traceNode(
      methodSignature(
        m.className,
        m.methodName,
        m.params.map((p) => parameterCapture(p, `"value"`, false)),
      ),
      { kind: "returned", renderedValue: null },
      [],
    ),
  );
  return traceTree(nodes);
}

describe("ClarityAnalyzer", () => {
  test("good naming scores higher than poor naming", () => {
    const good = makeTree([
      { className: "OrderService", methodName: "placeOrder", params: ["customerId", "quantity"] },
      {
        className: "InventoryService",
        methodName: "reserveStock",
        params: ["productId", "amount"],
      },
    ]);
    const poor = makeTree([
      { className: "DataManager", methodName: "processData", params: ["d", "x"] },
      { className: "Helper", methodName: "handleStuff", params: ["obj", "val"] },
    ]);

    const goodResult = analyzeClarity(good);
    const poorResult = analyzeClarity(poor);
    expect(goodResult.overall).toBeGreaterThan(poorResult.overall);
  });

  test("empty tree returns Java's 0.47 envelope", () => {
    // Java parity: no nodes → method/class 0, params default 1.0, structural 1.0, cohesion 0.7;
    // overall = 0.25 + 0.15 + 0.07 = 0.47.
    const result = analyzeClarity(traceTree([]));
    expect(result.method).toBe(0);
    expect(result.class).toBe(0);
    expect(result.parameter).toBe(1.0);
    expect(result.structural).toBe(1.0);
    expect(result.cohesion).toBe(0.7);
    expect(result.overall).toBeCloseTo(0.47, 10);
    expect(result.issues).toStrictEqual([]);
  });

  test("structural uses trace-wide maxima; cohesion averages per class (Java parity)", () => {
    // Depth-3 chain; deepest node carries 6 params. maxParams=6, maxDepth=3.
    // structural = 1 - 0.10*(6-4) = 0.80 (depth 3 ≤ 5 → no depth penalty), NOT a per-node average.
    const tree = traceTree([
      node(
        "OrderRepository",
        "findOrder",
        ["orderId"],
        [
          node(
            "OrderRepository",
            "saveOrder",
            ["order"],
            [node("OrderRepository", "deleteOrder", ["a", "b", "c", "d", "e", "f"])],
          ),
        ],
      ),
    ]);
    const result = analyzeClarity(tree);
    expect(result.structural).toBeCloseTo(0.8, 10);
    // Single class OrderRepository, all three verbs align (find/save/delete) → cohesion 1.0.
    expect(result.cohesion).toBe(1.0);
  });

  test("deep + wide trace penalizes structural on both axes globally", () => {
    // Chain of depth 7; the leaf carries 6 params. structural = 1 - 0.10*(6-4) - 0.05*(7-5) = 0.70.
    let cur = node("Svc", "run", ["a", "b", "c", "d", "e", "f"]);
    for (let i = 0; i < 6; i++) cur = node("Svc", "run", ["x"], [cur]);
    const result = analyzeClarity(traceTree([cur]));
    expect(result.structural).toBeCloseTo(0.7, 10);
  });

  test("generates issues for single-character parameter names", () => {
    const tree = makeTree([
      { className: "OrderService", methodName: "placeOrder", params: ["x", "y"] },
    ]);
    const result = analyzeClarity(tree);
    const paramIssues = result.issues.filter((i) => i.category === "param-name");
    expect(paramIssues.length).toBe(2);
    expect(paramIssues[0]?.severity).toBe("HIGH");
    expect(paramIssues.map((i) => i.element).sort()).toStrictEqual(["x", "y"]);
  });

  test("flags low-scoring method names as issues with Class.method element", () => {
    const tree = makeTree([
      { className: "OrderService", methodName: "process", params: ["customerId"] },
    ]);
    const result = analyzeClarity(tree);
    const methodIssues = result.issues.filter((i) => i.category === "method-name");
    expect(methodIssues.length).toBe(1);
    expect(methodIssues[0]?.element).toBe("OrderService.process");
    expect(methodIssues[0]?.impactScore).toBeGreaterThan(0);
  });

  test("flags low-scoring class names as issues", () => {
    const tree = makeTree([
      { className: "Helper", methodName: "placeOrder", params: ["customerId"] },
    ]);
    const result = analyzeClarity(tree);
    const classIssues = result.issues.filter((i) => i.category === "class-name");
    expect(classIssues.length).toBe(1);
    expect(classIssues[0]?.element).toBe("Helper");
  });

  test("methods with no parameters default to perfect parameter score", () => {
    const tree = makeTree([{ className: "OrderService", methodName: "placeOrder", params: [] }]);
    const result = analyzeClarity(tree);
    expect(result.parameter).toBe(1.0);
  });

  test("all dimension scores are between 0 and 1", () => {
    const tree = makeTree([
      { className: "OrderService", methodName: "placeOrder", params: ["customerId"] },
    ]);
    const result = analyzeClarity(tree);
    for (const key of [
      "overall",
      "method",
      "class",
      "parameter",
      "structural",
      "cohesion",
    ] as const) {
      expect(result[key]).toBeGreaterThanOrEqual(0);
      expect(result[key]).toBeLessThanOrEqual(1);
    }
  });

  test("deduplicates class names: repeated class scored only once", () => {
    const repeated = makeTree([
      { className: "OrderService", methodName: "placeOrder", params: ["customerId"] },
      { className: "OrderService", methodName: "cancelOrder", params: ["orderId"] },
      { className: "OrderService", methodName: "updateOrder", params: ["orderId"] },
    ]);
    const single = makeTree([
      { className: "OrderService", methodName: "placeOrder", params: ["customerId"] },
    ]);
    expect(repeated.roots.length).toBe(3);
    expect(single.roots.length).toBe(1);
    // Class score should be identical since both have only "OrderService"
    const repeatedResult = analyzeClarity(repeated);
    const singleResult = analyzeClarity(single);
    expect(repeatedResult.class).toBe(singleResult.class);
  });

  // The collocation dictionary is a positive signal only: a verb listed for a noun confirms the
  // name reads well, but a verb the sample never mentions is not evidence against it. An issue
  // fires only for a verb already weak elsewhere (generic, or unrecognized and verb-shaped) —
  // never merely because the actual verb is absent from the noun's 4-8-verb sample.
  test("standard verb with known noun is not flagged", () => {
    // "check" is a standard verb — absence from "ledger"'s preferred-verb sample
    // (reconcile/balance/post/close) is no evidence of a naming problem.
    const tree = makeTree([
      { className: "LedgerService", methodName: "checkLedger", params: ["ledgerId"] },
    ]);
    const result = analyzeClarity(tree);
    expect(result.issues.filter((i) => i.category === "collocation").length).toBe(0);
  });

  test("non-verb first token is not flagged", () => {
    // "leaf" is not a verb at all (unknown category; not verb-shaped by morphology either),
    // even though "node" has plenty of preferred verbs to suggest.
    const tree = makeTree([
      { className: "TreeWalker", methodName: "leafNode", params: ["nodeId"] },
    ]);
    const result = analyzeClarity(tree);
    expect(result.issues.filter((i) => i.category === "collocation").length).toBe(0);
  });

  test("generic verb with known noun is flagged with candidates", () => {
    // "handle" is generic — a known noun's preferred verbs are worth suggesting.
    const tree = makeTree([
      { className: "LedgerService", methodName: "handleLedger", params: ["ledgerId"] },
    ]);
    const result = analyzeClarity(tree);
    const collocationIssues = result.issues.filter((i) => i.category === "collocation");
    expect(collocationIssues.length).toBe(1);
    expect(collocationIssues[0]?.element).toBe("LedgerService.handleLedger");
    expect(collocationIssues[0]?.suggestion).toContain("reconcileLedger");
    expect(collocationIssues[0]?.severity).toBe("LOW");
  });

  test("generic verb declared in the project's own vocabulary is not flagged", () => {
    // The project's own glossary declares "handle" a domain verb for this codebase.
    const tree = makeTree([
      { className: "LedgerService", methodName: "handleLedger", params: ["ledgerId"] },
    ]);
    const vocabulary = domainVocabulary(["handle"], []);
    const result = analyzeClarity(tree, vocabulary);
    expect(result.issues.filter((i) => i.category === "collocation").length).toBe(0);
  });

  test("unknown verb-shaped first token with unknown noun yields nothing", () => {
    // "customize" is verb-shaped (ends in -ize) but in no built-in tier; "widget" is not a noun
    // the collocation dictionary knows, so there is nothing to suggest either way.
    const tree = makeTree([
      { className: "Service", methodName: "customizeWidget", params: ["widgetId"] },
    ]);
    const result = analyzeClarity(tree);
    expect(result.issues.filter((i) => i.category === "collocation").length).toBe(0);
  });

  test("valid collocation produces no collocation issue", () => {
    const tree = makeTree([
      { className: "OrderService", methodName: "placeOrder", params: ["orderId"] },
    ]);
    const result = analyzeClarity(tree);
    expect(result.issues.filter((i) => i.category === "collocation").length).toBe(0);
  });

  test("unknown noun skips collocation check", () => {
    const tree = makeTree([
      { className: "GraphRenderer", methodName: "renderWidget", params: ["widgetId"] },
    ]);
    const result = analyzeClarity(tree);
    expect(result.issues.filter((i) => i.category === "collocation").length).toBe(0);
  });

  test("single-token method name skips collocation check", () => {
    const tree = makeTree([
      { className: "OrderService", methodName: "process", params: ["orderId"] },
    ]);
    const result = analyzeClarity(tree);
    expect(result.issues.filter((i) => i.category === "collocation").length).toBe(0);
  });

  test("role-misaligned method lowers the cohesion score (no separate issue category)", () => {
    const tree = makeTree([
      { className: "GuestRepository", methodName: "renderReport", params: ["guestId"] },
    ]);
    const result = analyzeClarity(tree);
    expect(result.cohesion).toBeLessThan(1);
    // Java's issue model has no "misalignment" category; role misalignment surfaces via the score.
    expect(result.issues.every((i) => i.category !== "misalignment")).toBe(true);
  });

  test("dedup groups by category|element, summing occurrences and ranking by impactScore", () => {
    const tree = makeTree([
      { className: "Helper", methodName: "processData", params: ["x"] },
      { className: "Helper", methodName: "handleStuff", params: ["x"] },
    ]);
    const result = analyzeClarity(tree);
    const helperIssues = result.issues.filter(
      (i) => i.category === "class-name" && i.element === "Helper",
    );
    const shortParamIssues = result.issues.filter(
      (i) => i.category === "param-name" && i.element === "x",
    );
    expect(helperIssues).toHaveLength(1);
    // "x" appears in two nodes → one deduped issue with occurrences 2.
    expect(shortParamIssues).toHaveLength(1);
    expect(shortParamIssues[0]?.occurrences).toBe(2);
    expect(shortParamIssues[0]?.impactScore).toBe(6); // HIGH(3) × 2
    // Issues are ranked by impactScore descending.
    const scores = result.issues.map((i) => i.impactScore);
    expect(scores).toStrictEqual([...scores].sort((a, b) => b - a));
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java canonical source).
describe("bounded tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot(): TraceNode {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: { kind: "returned" as const, renderedValue: null },
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as TraceNode;
  }

  function deepChain(length: number): TraceNode {
    let n = node("Leaf", "op", []);
    for (let i = 0; i < length; i++) {
      n = node("Svc", "op", [], [n]);
    }
    return n;
  }

  test("does not crash on a cyclic tree", () => {
    expect(() => analyzeClarity(traceTree([cyclicRoot()]))).not.toThrow();
  });

  // Shrunk from a 50,000-deep chain to just past the walker's own depth limit (10,000): the walk
  // is non-recursive and stops at the limit regardless of how much chain lies beyond it, so a
  // chain one link longer than the limit exercises the identical code path — measured ~121ms run
  // alone in the dev container. vitest's default 5000ms per-test timeout is a wall-clock budget,
  // and release retrospective rule 3 says that budget must never be implicit — a test whose
  // legitimate cost varies with scheduler contention declares what it actually needs, and a hang
  // guard on a non-timing test takes a seconds-scale floor, never a millisecond-scale tolerance
  // close enough to the measured run to mistake ordinary contention for a hang. 3000ms is both
  // well past 5x the measured idle run and the floor itself.
  test("does not stack-overflow on a chain just past the depth limit", () => {
    expect(() => analyzeClarity(traceTree([deepChain(10_001)]))).not.toThrow();
  }, 3_000);
});
