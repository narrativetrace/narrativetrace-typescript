// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { partitionChildren } from "../src/child-segment.js";
import { concurrencyInfo } from "../src/concurrency-info.js";
import { methodSignature } from "../src/method-signature.js";
import { traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";

function seqNode(cls: string, method: string) {
  return traceNode(methodSignature(cls, method, []), returned('"ok"'), [], 10, 100);
}

function concNode(cls: string, method: string, groupId: string) {
  const info = concurrencyInfo(groupId, `${cls}.${method}`, "fork-join");
  return traceNode(methodSignature(cls, method, []), returned('"ok"'), [], 10, 100, info);
}

describe("partitionChildren", () => {
  test("keeps sequential nodes as-is", () => {
    const children = [seqNode("A", "a"), seqNode("B", "b")];
    const segments = partitionChildren(children);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.kind).toBe("sequential");
    expect(segments[1]?.kind).toBe("sequential");
  });

  test("groups consecutive concurrent siblings by groupId", () => {
    const children = [concNode("A", "a", "g1"), concNode("B", "b", "g1")];
    const segments = partitionChildren(children);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("fork-join");
    if (segments[0]?.kind === "fork-join") {
      expect(segments[0].members).toHaveLength(2);
      expect(segments[0].groupId).toBe("g1");
    }
  });

  test("returns empty array for empty children", () => {
    const segments = partitionChildren([]);
    expect(segments).toHaveLength(0);
  });

  test("handles mixed sequential + concurrent", () => {
    const children = [
      seqNode("Pre", "setup"),
      concNode("A", "a", "g1"),
      concNode("B", "b", "g1"),
      seqNode("Post", "teardown"),
    ];
    const segments = partitionChildren(children);
    expect(segments).toHaveLength(3);
    expect(segments[0]?.kind).toBe("sequential");
    expect(segments[1]?.kind).toBe("fork-join");
    expect(segments[2]?.kind).toBe("sequential");
    if (segments[1]?.kind === "fork-join") {
      expect(segments[1].members).toHaveLength(2);
    }
  });

  test("groups fire-and-forget nodes with correct kind", () => {
    const info = concurrencyInfo("fanf-1", "OrderService", "fire-and-forget");
    const marker = traceNode(
      methodSignature("OrderService", "⤳ fire-and-forget", []),
      returned(null),
      [],
      0,
      0,
      info,
    );
    const segments = partitionChildren([marker]);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("fire-and-forget");
  });
});
