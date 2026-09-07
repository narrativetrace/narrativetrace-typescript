// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import { resolveTraceIdentity } from "../src/trace-identity.js";
import { humanName } from "../src/trace-namer.js";
import { type TraceNode, traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

/**
 * The invariants of eager identity, stated as properties rather than examples.
 *
 * The bug class being pinned is not "one wrong constant": it is *any* emitter rule that makes two
 * unrelated captures indistinguishable, which is precisely the job `trace_id` exists to do. A
 * property over arbitrary context-free shapes catches the whole class — a synthetic constant, a
 * hash of the shape, a per-process singleton — where an example only catches the one that shipped.
 */

const identifier = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,11}$/);

/**
 * A context-free call tree of bounded depth: the plain unit-test shape, where nothing supplies an
 * identity. Depth is bounded by construction rather than by `fc.letrec`, whose unguarded recursion
 * exhausts the stack here.
 */
function contextFreeNode(depth: number): fc.Arbitrary<TraceNode> {
  const children =
    depth <= 1 ? fc.constant([]) : fc.array(contextFreeNode(depth - 1), { maxLength: 2 });
  return fc
    .tuple(identifier, identifier, children)
    .map(([className, methodName, kids]) =>
      traceNode(methodSignature(className, methodName, []), returned('"ok"'), kids),
    );
}

const contextFreeForest = fc.array(contextFreeNode(3), { minLength: 1, maxLength: 3 });

describe("eager identity holds for any context-free capture", () => {
  test("two independent captures never share a trace id", () => {
    fc.assert(
      fc.property(contextFreeForest, (roots) => {
        const first = resolveTraceIdentity(traceTree(roots));
        const second = resolveTraceIdentity(traceTree(roots));

        expect(first.traceId).not.toBe(second.traceId);
      }),
    );
  });

  test("story and chapter stay derived and stable across those captures", () => {
    fc.assert(
      fc.property(contextFreeForest, (roots) => {
        const first = resolveTraceIdentity(traceTree(roots));
        const second = resolveTraceIdentity(traceTree(roots));
        const root = roots[0]?.signature;

        expect(first.storyId).toBe(`${root?.className}.${root?.methodName}`);
        expect(second.storyId).toBe(first.storyId);
        expect(second.chapterId).toBe(first.chapterId);
      }),
    );
  });

  test("every resolved id is W3C-shaped and its name agrees with it", () => {
    fc.assert(
      fc.property(contextFreeForest, (roots) => {
        const identity = resolveTraceIdentity(traceTree(roots));

        expect(identity.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(identity.traceId).not.toBe("0".repeat(32));
        expect(identity.traceName).toBe(humanName(identity.traceId));
      }),
    );
  });
});
