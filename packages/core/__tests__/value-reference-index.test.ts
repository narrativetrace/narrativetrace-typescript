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
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java canonical source):
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

  // Shrunk from a 50,000-deep chain to just past the walker's own depth limit (10,000): the walk
  // is non-recursive and stops at the limit regardless of how much chain lies beyond it, so a
  // chain one link longer than the limit exercises the identical code path — measured ~62ms run
  // alone in the dev container. vitest's default 5000ms per-test timeout is a wall-clock budget,
  // and release retrospective rule 3 says that budget must never be implicit — a test whose
  // legitimate cost varies with scheduler contention declares what it actually needs, and a hang
  // guard on a non-timing test takes a seconds-scale floor, never a millisecond-scale tolerance
  // close enough to the measured run to mistake ordinary contention for a hang. 3000ms is both
  // well past 5x the measured idle run and the floor itself.
  test("does not stack-overflow on a chain just past the depth limit", () => {
    expect(() => ValueReferenceIndex.build(traceTree([deepChain(10_001)]))).not.toThrow();
  }, 3_000);
});
