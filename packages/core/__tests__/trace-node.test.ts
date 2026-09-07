// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import { firstSpanContext, hasAnyError, type TraceNode, traceNode } from "../src/trace-node.js";
import { returned, threw } from "../src/trace-outcome.js";

// A hand-built or deserialized tree (not constructed via `traceNode()`) can hold an ancestor —
// nothing at the type level prevents it. Mirrors the Java `TraceTree.durationNanos()` finding
// (2026-09-03-unbounded-tree-walks-in-free-renderers.md): the *foundational* walk every renderer's
// duration/identity/error-summary line depends on must be bounded, or every walker built on top of
// it is moot regardless of its own guard.
function cyclicNode(): TraceNode {
  const self = {
    signature: methodSignature("Svc", "op", []),
    outcome: returned('"ok"'),
    children: [] as TraceNode[],
    durationMs: 0,
    startTimeMs: 0,
  };
  self.children = [self as unknown as TraceNode];
  return self as unknown as TraceNode;
}

function deepChain(length: number): TraceNode {
  let node = traceNode(methodSignature("Leaf", "op", []), returned('"ok"'), []);
  for (let i = 0; i < length; i++) {
    node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [node]);
  }
  return node;
}

describe("traceNode", () => {
  test("leaf node (no children)", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    expect(node.signature.methodName).toBe("op");
    expect(node.children).toHaveLength(0);
    expect(node.outcome.kind).toBe("returned");
  });

  test("nested tree (parent→child)", () => {
    const child = traceNode(methodSignature("Repo", "find", []), returned('"found"'), []);
    const parent = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child]);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]?.signature.className).toBe("Repo");
  });

  test("captures durationMs", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 42);
    expect(node.durationMs).toBe(42);
  });

  test("durationMs defaults to 0", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    expect(node.durationMs).toBe(0);
  });

  test("startTimeMs defaults to zero when not provided", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    expect(node.startTimeMs).toBe(0);
  });

  test("startTimeMs preserves explicit value", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 10, 1234.567);
    expect(node.startTimeMs).toBe(1234.567);
  });

  test("concurrency defaults to undefined when not provided", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    expect(node.concurrency).toBeUndefined();
  });

  test("children frozen", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    expect(() => {
      (node.children as unknown[]).push("hacked");
    }).toThrow(TypeError);
  });

  test("3-level deep tree navigable", () => {
    const leaf = traceNode(methodSignature("Db", "query", []), returned('"row"'), []);
    const mid = traceNode(methodSignature("Repo", "find", []), returned('"found"'), [leaf]);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [mid]);
    expect(root.children[0]?.children[0]?.signature.className).toBe("Db");
  });

  test("threw outcome preserves error reference", () => {
    const err = new Error("boom");
    const node = traceNode(methodSignature("Svc", "op", []), threw(err), []);
    expect(node.outcome.kind).toBe("threw");
    if (node.outcome.kind === "threw") {
      expect(node.outcome.error).toBe(err);
    }
  });
});

describe("hasAnyError", () => {
  test("returns false for all-success nodes", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    expect(hasAnyError([node])).toBe(false);
  });

  test("returns true when root node threw", () => {
    const node = traceNode(methodSignature("Svc", "op", []), threw(new Error("fail")), []);
    expect(hasAnyError([node])).toBe(true);
  });

  test("returns true when nested child threw", () => {
    const child = traceNode(methodSignature("Repo", "find", []), threw(new Error("db error")), []);
    const parent = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child]);
    expect(hasAnyError([parent])).toBe(true);
  });

  test("returns false for empty list", () => {
    expect(hasAnyError([])).toBe(false);
  });

  test("does not crash on a cyclic tree", () => {
    expect(hasAnyError([cyclicNode()])).toBe(false);
  });

  test("does not stack-overflow on a very deep chain", () => {
    expect(hasAnyError([deepChain(50_000)])).toBe(false);
  });
});

describe("firstSpanContext", () => {
  test("does not crash on a cyclic tree", () => {
    expect(firstSpanContext([cyclicNode()])).toBeUndefined();
  });

  test("does not stack-overflow on a very deep chain", () => {
    expect(firstSpanContext([deepChain(50_000)])).toBeUndefined();
  });
});
