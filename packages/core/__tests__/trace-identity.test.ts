// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import { resolveTraceIdentity, rootCallName } from "../src/trace-identity.js";
import { humanName } from "../src/trace-namer.js";
import { type TraceNode, traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";
import { type TraceTree, traceTree } from "../src/trace-tree.js";

const trId = "aaaabbbbccccddddeeee111122223333" as TraceId;
const assigned = "ffffeeeeddddccccbbbbaaaa99998888" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function node(method: string, children: TraceNode[] = [], sc?: ReturnType<typeof spanContext>) {
  return traceNode(
    methodSignature("Svc", method, []),
    returned('"ok"'),
    children,
    1,
    0,
    undefined,
    sc,
  );
}

/**
 * A tree that carries no id of its own, which {@link traceTree} never produces for a non-empty
 * forest. Resolution must not depend on how the tree was built: a deserialized or hand-assembled
 * tree resolves by the same ladder.
 */
function carryingNoId(roots: TraceNode[]): TraceTree {
  return { roots, isEmpty: roots.length === 0 };
}

describe("rootCallName", () => {
  test("names the first root-level call", () => {
    expect(rootCallName([node("compute")])).toBe("Svc.compute");
  });

  test("reads the first root, not the deepest or the last", () => {
    expect(rootCallName([node("first"), node("second")])).toBe("Svc.first");
  });
});

describe("resolveTraceIdentity: adopt, then inherit, then generate", () => {
  test("adopts the id the tree carries", () => {
    expect(resolveTraceIdentity(traceTree([node("compute")], assigned)).traceId).toBe(assigned);
  });

  test("inherits the first span context's id when the tree carries none", () => {
    const tree = carryingNoId([node("compute", [], spanContext(trId, sid(1), null))]);

    expect(resolveTraceIdentity(tree).traceId).toBe(trId);
  });

  test("inheritance scans the whole tree depth-first, not roots[0] only", () => {
    const deep = node("outer", [node("mid", [node("inner", [], spanContext(trId, sid(3), null))])]);

    expect(resolveTraceIdentity(carryingNoId([deep])).traceId).toBe(trId);
  });

  test("generates a real, W3C-shaped id when nothing supplies one", () => {
    const traceId = resolveTraceIdentity(carryingNoId([node("compute")])).traceId;

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceId).not.toBe("0".repeat(32));
  });

  test("a generated id is unique — two captures are never mistaken for one", () => {
    const first = resolveTraceIdentity(carryingNoId([node("compute")])).traceId;
    const second = resolveTraceIdentity(carryingNoId([node("compute")])).traceId;

    expect(first).not.toBe(second);
  });

  test("an empty tree still resolves a schema-valid identity", () => {
    // Nothing ran, so the tree carries no id — but a chapter written for it is still a document
    // that has to validate, and `chapter.schema.json` patterns `trace_id`.
    const identity = resolveTraceIdentity(traceTree([]));

    expect(identity.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(identity.storyId).not.toBe("");
    expect(identity.chapterId).toBe(identity.storyId);
  });
});

describe("resolveTraceIdentity: story and chapter", () => {
  test("derives the story from the first root-level call when none is inherited", () => {
    const identity = resolveTraceIdentity(traceTree([node("compute")]));

    expect(identity.storyId).toBe("Svc.compute");
    expect(identity.chapterId).toBe("Svc.compute");
  });

  test("inherits the story the span context names", () => {
    const sc = spanContext(trId, sid(1), null, undefined, { storyId: "Orders.place" });

    expect(resolveTraceIdentity(carryingNoId([node("compute", [], sc)])).storyId).toBe(
      "Orders.place",
    );
  });

  test("chapter falls back to the story when the context names no chapter", () => {
    const sc = spanContext(trId, sid(1), null, undefined, { storyId: "Orders.place" });

    expect(resolveTraceIdentity(carryingNoId([node("compute", [], sc)])).chapterId).toBe(
      "Orders.place",
    );
  });

  test("chapter is inherited when the context names one", () => {
    const sc = spanContext(trId, sid(1), null, undefined, {
      storyId: "Orders.place",
      chapterId: "Orders.charge",
    });

    expect(resolveTraceIdentity(carryingNoId([node("compute", [], sc)])).chapterId).toBe(
      "Orders.charge",
    );
  });

  test("story is never generated — a fresh trace id does not become a story", () => {
    const identity = resolveTraceIdentity(traceTree([node("compute")]));

    expect(identity.storyId).not.toBe(identity.traceId);
  });
});

describe("resolveTraceIdentity: the inherited context answers for the whole tree", () => {
  test("exposes the context a context-free root cannot supply service and environment from", () => {
    const child = node("inner", [], spanContext(trId, sid(2), null, { serviceName: "orders" }));

    expect(
      resolveTraceIdentity(carryingNoId([node("outer", [child])])).inherited?.serviceName,
    ).toBe("orders");
  });

  test("exposes no context at all for a capture that had none", () => {
    expect(resolveTraceIdentity(traceTree([node("compute")])).inherited).toBeUndefined();
  });
});

describe("resolveTraceIdentity: the name agrees with the id", () => {
  test("derives the trace name from the resolved id, adopted", () => {
    const identity = resolveTraceIdentity(traceTree([node("compute")], assigned));

    expect(identity.traceName).toBe(humanName(assigned));
  });

  test("derives the trace name from the resolved id, generated", () => {
    const identity = resolveTraceIdentity(traceTree([node("compute")]));

    expect(identity.traceName).toBe(humanName(identity.traceId));
    expect(identity.traceName).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });
});
