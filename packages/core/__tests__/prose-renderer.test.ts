// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { concurrencyInfo } from "../src/concurrency-info.js";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";
import { renderProse } from "../src/prose-renderer.js";
import { traceNode } from "../src/trace-node.js";
import { incomplete, returned, threw } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

describe("renderProse", () => {
  test("a redacted param renders the [REDACTED] marker, not the captured value", () => {
    const sig = methodSignature("Auth", "login", [parameterCapture("token", "SECRET", true)]);
    const result = renderProse(traceTree([traceNode(sig, returned('"OK"'), [])]));
    expect(result).toContain("token: [REDACTED]");
    expect(result).not.toContain("SECRET");
  });

  test("renders single method call as natural language", () => {
    const sig = methodSignature("OrderService", "placeOrder", [
      parameterCapture("orderId", '"order-42"', false),
      parameterCapture("quantity", "3", false),
    ]);
    const node = traceNode(sig, returned('"OK"'), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toBe(
      'The order service places order for orderId: "order-42", quantity: 3, returning "OK".',
    );
  });

  test("renders error path with failure phrasing", () => {
    const sig = methodSignature("PaymentService", "charge", [
      parameterCapture("amount", "100", false),
    ]);
    const node = traceNode(sig, threw(new Error("insufficient funds")), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toBe(
      "The payment service failed to charge for amount: 100 — Error: insufficient funds.",
    );
  });

  test("void method omits return clause", () => {
    const sig = methodSignature("Logger", "log", [parameterCapture("msg", '"hello"', false)]);
    const node = traceNode(sig, returned(null), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toBe('The logger logs for msg: "hello".');
  });

  test("verb ending in ch adds es suffix", () => {
    const sig = methodSignature("EventService", "dispatchEvent", []);
    const node = traceNode(sig, returned(null), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toContain("dispatches event");
  });

  test("verb ending in y with consonant before converts to ies", () => {
    const sig = methodSignature("AlertService", "notifyUser", []);
    const node = traceNode(sig, returned(null), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toContain("notifies user");
  });

  test("verb ending in y with vowel before adds s", () => {
    const sig = methodSignature("GameService", "playGame", []);
    const node = traceNode(sig, returned(null), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toContain("plays game");
  });

  test("non-Error thrown renders as string", () => {
    const sig = methodSignature("Svc", "op", []);
    const node = traceNode(sig, threw("raw error string"), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toContain("failed to op");
    expect(result).toContain("string: raw error string");
  });

  test("includes the exception type and error context", () => {
    class NotFoundError extends Error {}
    const node = traceNode(
      methodSignature("Repo", "find", []),
      threw(new NotFoundError("missing"), "no such 42"),
      [],
    );
    const result = renderProse(traceTree([node]));
    expect(result).toContain("The repo failed to find");
    expect(result).toContain("NotFoundError: missing (no such 42)");
  });

  test("incomplete outcome renders no-exit phrasing", () => {
    const node = traceNode(methodSignature("Svc", "op", []), incomplete(), []);
    const tree = traceTree([node]);

    const result = renderProse(tree);

    expect(result).toContain("incomplete (no exit recorded)");
  });

  test("renders concurrent block as 'Concurrently:' with sorted labels", () => {
    const info1 = concurrencyInfo("g1", "Z.z", "fork-join");
    const info2 = concurrencyInfo("g1", "A.a", "fork-join");
    const child1 = traceNode(methodSignature("Z", "z", []), returned('"ok"'), [], 10, 100, info1);
    const child2 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 10, 100, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderProse(tree);

    expect(result).toContain("Concurrently: A.a, Z.z.");
  });

  test("shows sequential-async optimization hint", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 50, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 30, 200, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderProse(tree);

    expect(result).toContain("awaited sequentially");
  });

  test("renders fire-and-forget without concurrent block", () => {
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

    const result = renderProse(tree);

    expect(result).toContain("fire-and-forget");
    expect(result).not.toContain("Concurrently:");
  });

  test("nested calls render as separate sentences", () => {
    const child = traceNode(
      methodSignature("InventoryService", "reserve", [
        parameterCapture("productId", '"P1"', false),
      ]),
      returned("true"),
      [],
    );
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), [
      child,
    ]);
    const tree = traceTree([root]);

    const result = renderProse(tree);

    expect(result).toBe(
      'The order service places order, returning "OK". The inventory service reserves for productId: "P1", returning true.',
    );
  });

  // className/methodName/parameter names are trace metadata: unlike a captured value they are not
  // control-escaped upstream, so a hostile one reaching a renderer raw would inject an extra
  // sentence break (cross-port shape F4, 2026-09-02 audit).
  test("a control character in className/methodName/a parameter name does not inject an extra sentence", () => {
    const sig = methodSignature("A\nB", "c\nd", [parameterCapture("e\nf", '"v"', false)]);
    const node = traceNode(sig, returned('"OK"'), []);

    const result = renderProse(traceTree([node]));

    expect(result.split("\n")).toHaveLength(1);
    expect(result).not.toContain("\n");
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-port mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
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
    expect(renderProse(traceTree([cyclicRoot()]))).toContain("… (cycle)");
  });

  test("does not stack-overflow on a very deep chain, and marks the depth limit", () => {
    expect(renderProse(traceTree([deepChain(50_000)]))).toContain("… (depth limit)");
  });
});
