// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import { traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

const leaf = () => traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);

const trId = "aaaabbbbccccddddeeee111122223333" as TraceId;
const assigned = "ffffeeeeddddccccbbbbaaaa99998888" as TraceId;

function captured(sc = spanContext(trId, "0000000000000001" as SpanId, null)) {
  return traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 1, 0, undefined, sc);
}

describe("traceTree", () => {
  test("empty tree: isEmpty=true", () => {
    const tree = traceTree([]);
    expect(tree.isEmpty).toBe(true);
    expect(tree.roots).toHaveLength(0);
  });

  test("one root: isEmpty=false", () => {
    const tree = traceTree([leaf()]);
    expect(tree.isEmpty).toBe(false);
    expect(tree.roots).toHaveLength(1);
  });

  test("multiple roots preserved", () => {
    const tree = traceTree([leaf(), leaf(), leaf()]);
    expect(tree.roots).toHaveLength(3);
  });

  test("roots frozen", () => {
    const tree = traceTree([leaf()]);
    expect(() => {
      (tree.roots as unknown[]).push(leaf());
    }).toThrow(TypeError);
  });

  test("tree object frozen", () => {
    const tree = traceTree([]);
    expect(() => {
      (tree as { isEmpty: boolean }).isEmpty = false;
    }).toThrow(TypeError);
  });

  test("defensive copy (input mutation doesn't affect tree)", () => {
    const roots = [leaf()];
    const tree = traceTree(roots);
    roots.push(leaf());
    expect(tree.roots).toHaveLength(1);
  });
});

describe("traceTree identity", () => {
  test("carries the id its capturing context assigned, untouched", () => {
    expect(traceTree([leaf()], assigned).traceId).toBe(assigned);
  });

  test("inherits the id of the first span context when handed none", () => {
    expect(traceTree([captured()]).traceId).toBe(trId);
  });

  test("inheritance reaches a context found only deep in the tree", () => {
    const root = traceNode(methodSignature("Svc", "outer", []), returned('"ok"'), [captured()]);

    expect(traceTree([root]).traceId).toBe(trId);
  });

  test("generates a real, W3C-shaped id when nothing in the tree supplies one", () => {
    const traceId = traceTree([leaf()]).traceId;

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceId).not.toBe("0".repeat(32));
  });

  test("generates once per tree, so every reader sees the same id", () => {
    const tree = traceTree([leaf()]);

    expect(tree.traceId).toBe(tree.traceId);
    expect(traceTree([leaf()]).traceId).not.toBe(tree.traceId);
  });

  test("an empty tree carries no id — nothing ran, nothing to identify", () => {
    expect(traceTree([]).traceId).toBeUndefined();
    expect(traceTree([], assigned).traceId).toBeUndefined();
  });
});
