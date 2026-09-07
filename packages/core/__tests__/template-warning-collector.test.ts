// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import {
  collectTemplateWarnings,
  formatTemplateWarnings,
} from "../src/template-warning-collector.js";
import { type TraceNode, traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

function node(
  className: string,
  methodName: string,
  opts: { narration?: string; errorContext?: string },
  children: TraceNode[] = [],
) {
  return traceNode(methodSignature(className, methodName, [], opts), returned('"ok"'), children);
}

describe("collectTemplateWarnings", () => {
  test("flags an unresolved placeholder in narration", () => {
    const tree = traceTree([
      node("OrderService", "placeOrder", { narration: "for {customer.name}" }),
    ]);

    expect(collectTemplateWarnings(tree)).toEqual([
      {
        className: "OrderService",
        methodName: "placeOrder",
        placeholder: "customer.name",
        field: "narration",
      },
    ]);
  });

  test("flags an unresolved placeholder in errorContext", () => {
    const tree = traceTree([node("Svc", "op", { errorContext: "no such {id}" })]);

    expect(collectTemplateWarnings(tree)).toEqual([
      { className: "Svc", methodName: "op", placeholder: "id", field: "errorContext" },
    ]);
  });

  test("flags multiple tokens and hyphen/space/multi-segment tokens", () => {
    const tree = traceTree([
      node("Svc", "op", { narration: "{a} and {order-id} and {a b} and {x.y.z}" }),
    ]);

    expect(collectTemplateWarnings(tree).map((w) => w.placeholder)).toEqual([
      "a",
      "order-id",
      "a b",
      "x.y.z",
    ]);
  });

  test("recurses into child nodes", () => {
    const child = node("Repo", "load", { narration: "{missing}" });
    const tree = traceTree([node("Svc", "op", { narration: "clean" }, [child])]);

    expect(collectTemplateWarnings(tree)).toEqual([
      { className: "Repo", methodName: "load", placeholder: "missing", field: "narration" },
    ]);
  });

  test("returns nothing when all placeholders resolved", () => {
    const tree = traceTree([node("Svc", "op", { narration: "fully resolved" })]);
    expect(collectTemplateWarnings(tree)).toEqual([]);
  });

  test("returns nothing for an empty tree", () => {
    expect(collectTemplateWarnings(traceTree([]))).toEqual([]);
  });
});

describe("formatTemplateWarnings", () => {
  test("returns an empty string with no warnings", () => {
    expect(formatTemplateWarnings([])).toBe("");
  });

  test("renders a header and one bullet per warning", () => {
    expect(
      formatTemplateWarnings([
        {
          className: "OrderService",
          methodName: "placeOrder",
          placeholder: "id",
          field: "narration",
        },
        { className: "Svc", methodName: "op", placeholder: "x", field: "errorContext" },
      ]),
    ).toBe(
      "WARNING: Unresolved template placeholder(s) detected:\n" +
        "  - OrderService.placeOrder: {id} in narration\n" +
        "  - Svc.op: {x} in errorContext\n",
    );
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-port mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot(): TraceNode {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned('"ok"'),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as TraceNode;
  }

  function deepChain(length: number): TraceNode {
    let node = traceNode(methodSignature("Leaf", "op", []), returned('"ok"'), []);
    for (let i = 0; i < length; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [node]);
    }
    return node;
  }

  test("does not crash on a cyclic tree", () => {
    expect(() => collectTemplateWarnings(traceTree([cyclicRoot()]))).not.toThrow();
  });

  test("does not stack-overflow on a very deep chain", () => {
    expect(() => collectTemplateWarnings(traceTree([deepChain(50_000)]))).not.toThrow();
  });
});
