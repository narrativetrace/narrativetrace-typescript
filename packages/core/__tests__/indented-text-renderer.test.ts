// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { concurrencyInfo } from "../src/concurrency-info.js";
import { renderIndentedText } from "../src/indented-text-renderer.js";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";
import { traceNode } from "../src/trace-node.js";
import { incomplete, returned, threw } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

describe("renderIndentedText", () => {
  test("a redacted param renders the [REDACTED] marker, not the captured value", () => {
    const sig = methodSignature("Auth", "login", [parameterCapture("token", "SECRET", true)]);
    const result = renderIndentedText(traceTree([traceNode(sig, returned('"OK"'), [])]));
    expect(result).toContain("token: [REDACTED]");
    expect(result).not.toContain("SECRET");
  });

  test("single method renders as single line", () => {
    const sig = methodSignature("OrderService", "placeOrder", [
      parameterCapture("orderId", '"order-42"', false),
    ]);
    const node = traceNode(sig, returned('"OK"'), []);
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toBe('OrderService.placeOrder(orderId: "order-42") → "OK"');
  });

  test("nested calls render as tree with box-drawing", () => {
    const child1 = traceNode(
      methodSignature("InventoryService", "reserve", [
        parameterCapture("productId", '"P1"', false),
      ]),
      returned("true"),
      [],
    );
    const child2 = traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "100", false)]),
      returned('"receipt-1"'),
      [],
    );
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), [
      child1,
      child2,
    ]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toBe(
      [
        'OrderService.placeOrder() → "OK"',
        '├── InventoryService.reserve(productId: "P1") → true',
        '└── PaymentService.charge(amount: 100) → "receipt-1"',
      ].join("\n"),
    );
  });

  test("error paths show error marker", () => {
    const node = traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "100", false)]),
      threw(new Error("insufficient funds")),
      [],
    );
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toBe("PaymentService.charge(amount: 100) ✗ Error: insufficient funds");
  });

  test("non-Error thrown renders as string", () => {
    const node = traceNode(methodSignature("Svc", "op", []), threw("raw error"), []);
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toContain("✗ string: raw error");
  });

  test("shows the exception type and error context pipe-delimited", () => {
    class NotFoundError extends Error {}
    const node = traceNode(
      methodSignature("Repo", "find", []),
      threw(new NotFoundError("missing"), "no such 42"),
      [],
    );
    const result = renderIndentedText(traceTree([node]));
    expect(result).toContain("✗ NotFoundError: missing | no such 42");
  });

  test("incomplete outcome renders hourglass marker", () => {
    const node = traceNode(methodSignature("Svc", "op", []), incomplete(), []);
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toContain("⏳ (incomplete)");
  });

  test("renders fork/join markers for concurrent children", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 50, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 120, 100, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("⑂ fork [2 tasks]");
    expect(result).toContain("↦ A.a()");
    expect(result).toContain("↦ B.b()");
    expect(result).toContain("⑃ join — 120ms");
  });

  test("sorts concurrent members deterministically", () => {
    const info1 = concurrencyInfo("g1", "Z.z", "fork-join");
    const info2 = concurrencyInfo("g1", "A.a", "fork-join");
    const child1 = traceNode(methodSignature("Z", "z", []), returned('"ok"'), [], 10, 100, info1);
    const child2 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 10, 100, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);
    const lines = result.split("\n");
    const memberLines = lines.filter((l) => l.includes("↦"));

    expect(memberLines[0]).toContain("A.a");
    expect(memberLines[1]).toContain("Z.z");
  });

  test("renders fork-join with sequential sibling after (not-last branch)", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 10, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 10, 100, info2);
    const after = traceNode(methodSignature("Post", "run", []), returned('"done"'), []);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [
      child1,
      child2,
      after,
    ]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("├── ⑂ fork");
    expect(result).toContain("│   ↦");
    expect(result).toContain("├── ⑃ join");
    expect(result).toContain("└── Post.run()");
  });

  test("shows sequential-async annotation for non-overlapping fork-join tasks", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 50, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 30, 200, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("[async, awaited sequentially]");
    expect(result).toContain("⚡ Sequential async");
  });

  test("renders fire-and-forget without fork/join markers", () => {
    const info = concurrencyInfo("fanf-1", "OrderService", "fire-and-forget");
    const marker = traceNode(
      methodSignature("OrderService", "⤳ fire-and-forget", []),
      returned(null),
      [],
      0,
      0,
      info,
    );
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [marker]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("⤳ fire-and-forget");
    expect(result).not.toContain("⑂ fork");
    expect(result).not.toContain("⑃ join");
  });

  test("void method omits return arrow", () => {
    const node = traceNode(
      methodSignature("Logger", "log", [parameterCapture("msg", '"hello"', false)]),
      returned(null),
      [],
    );
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toBe('Logger.log(msg: "hello")');
  });

  // className/methodName/parameter names are trace metadata: unlike a captured value they are not
  // control-escaped upstream, so a hostile one reaching a renderer raw would inject an extra line
  // (cross-runtime shape F4, 2026-09-02 audit).
  test("a control character in className/methodName/a parameter name does not inject an extra line", () => {
    const sig = methodSignature("A\nB", "c\nd", [parameterCapture("e\nf", '"v"', false)]);
    const node = traceNode(sig, returned('"OK"'), []);

    const result = renderIndentedText(traceTree([node]));

    expect(result.split("\n")).toHaveLength(1);
    expect(result).toBe('A\\nB.c\\nd(e\\nf: "v") → "OK"');
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded call-tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot() {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned('"ok"'),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as ReturnType<typeof traceNode>;
  }

  function deepChain(length: number) {
    let node = traceNode(methodSignature("Leaf", "op", []), returned('"ok"'), []);
    for (let i = 0; i < length; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [node]);
    }
    return node;
  }

  test("does not crash on a cyclic tree, and marks the cycle instead of looping forever", () => {
    expect(renderIndentedText(traceTree([cyclicRoot()]))).toContain("… (cycle)");
  });

  test("does not stack-overflow on a very deep chain, and marks the depth limit", () => {
    expect(renderIndentedText(traceTree([deepChain(50_000)]))).toContain("… (depth limit)");
  });

  test("an ordinary tree well within the bound renders exactly as before", () => {
    const child = traceNode(methodSignature("Repo", "find", []), returned('"found"'), []);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child]);
    expect(renderIndentedText(traceTree([root]))).toBe(
      'Svc.op() → "ok"\n└── Repo.find() → "found"',
    );
  });
});
