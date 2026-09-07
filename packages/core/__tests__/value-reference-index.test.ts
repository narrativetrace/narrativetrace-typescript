// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import { type TraceNode, traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";
import { ValueReferenceIndex } from "../src/value-reference-index.js";

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-port mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source):
// ValueReferenceIndex.build runs before any renderer's own walk, so it is a foundational bound the
// same way trace-node.ts's hasAnyError/firstSpanContext are.
describe("ValueReferenceIndex.build", () => {
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
    expect(() => ValueReferenceIndex.build(traceTree([cyclicRoot()]))).not.toThrow();
  });

  test("does not stack-overflow on a very deep chain", () => {
    expect(() => ValueReferenceIndex.build(traceTree([deepChain(50_000)]))).not.toThrow();
  });
});
