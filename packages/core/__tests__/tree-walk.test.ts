// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { TREE_WALK_MARKER, TreeWalk, walkPreOrder } from "../src/tree-walk.js";

interface Node {
  readonly id: string;
  children: Node[];
}

function node(id: string, children: Node[] = []): Node {
  return { id, children };
}

describe("TreeWalk", () => {
  test("enter proceeds (returns undefined) for an ordinary nested path", () => {
    const walk = new TreeWalk<object>();
    const a = {};
    const b = {};
    expect(walk.enter(a)).toBeUndefined();
    expect(walk.enter(b)).toBeUndefined();
    walk.exit(b);
    walk.exit(a);
  });

  test("re-entering a node already on the active path is a cycle", () => {
    const walk = new TreeWalk<object>();
    const node = {};
    expect(walk.enter(node)).toBeUndefined();
    expect(walk.enter(node)).toBe("cycle");
  });

  test("the same node reached via two sibling (non-overlapping) paths is a diamond, not a cycle", () => {
    const walk = new TreeWalk<object>();
    const shared = {};
    expect(walk.enter(shared)).toBeUndefined();
    walk.exit(shared);
    expect(walk.enter(shared)).toBeUndefined();
  });

  test("exit correctly pairs so a sibling reuses the same depth slot", () => {
    const walk = new TreeWalk<object>();
    const a = {};
    const b1 = {};
    const b2 = {};
    walk.enter(a);
    expect(walk.enter(b1)).toBeUndefined();
    walk.exit(b1);
    expect(walk.enter(b2)).toBeUndefined();
    walk.exit(b2);
    walk.exit(a);
  });

  test("a chain reaching exactly 10,000 nested levels never hits the depth limit", () => {
    const walk = new TreeWalk<object>();
    for (let i = 0; i < 10_000; i++) {
      expect(walk.enter({})).toBeUndefined();
    }
  });

  test("the 10,001st nested level is stopped as depth-limit", () => {
    const walk = new TreeWalk<object>();
    for (let i = 0; i < 10_000; i++) walk.enter({});
    expect(walk.enter({})).toBe("depth-limit");
  });

  test("marker text matches the Java wording exactly", () => {
    expect(TREE_WALK_MARKER["depth-limit"]).toBe("… (depth limit)");
    expect(TREE_WALK_MARKER.cycle).toBe("… (cycle)");
  });
});

describe("walkPreOrder", () => {
  const childrenOf = (n: Node) => n.children;

  test("visits every node in depth-first pre-order, roots left to right", () => {
    const tree = node("a", [node("b", [node("d")]), node("c")]);
    const visited: string[] = [];
    walkPreOrder([tree], childrenOf, (n) => {
      visited.push(n.id);
    });
    expect(visited).toEqual(["a", "b", "d", "c"]);
  });

  test("multiple roots are each walked in order", () => {
    const visited: string[] = [];
    walkPreOrder([node("r1"), node("r2")], childrenOf, (n) => {
      visited.push(n.id);
    });
    expect(visited).toEqual(["r1", "r2"]);
  });

  test("onEnter returning false stops the whole walk early", () => {
    const tree = node("a", [node("b"), node("c")]);
    const visited: string[] = [];
    walkPreOrder([tree], childrenOf, (n) => {
      visited.push(n.id);
      return n.id !== "b";
    });
    expect(visited).toEqual(["a", "b"]);
  });

  test("onExit runs post-order for every fully-descended node, not for a stopped one", () => {
    const tree = node("a", [node("b")]);
    const entered: string[] = [];
    const exited: string[] = [];
    walkPreOrder(
      [tree],
      childrenOf,
      (n) => {
        entered.push(n.id);
      },
      (n) => {
        exited.push(n.id);
      },
    );
    expect(entered).toEqual(["a", "b"]);
    expect(exited).toEqual(["b", "a"]);
  });

  test("a cyclic tree is visited once per occurrence on the path, then marked and stopped", () => {
    const a: Node = node("a");
    const b: Node = node("b", [a]);
    a.children = [b];
    const stops: (string | undefined)[] = [];
    const visited: string[] = [];
    walkPreOrder([a], childrenOf, (n, stop) => {
      visited.push(n.id);
      stops.push(stop);
    });
    expect(visited).toEqual(["a", "b", "a"]);
    expect(stops).toEqual([undefined, undefined, "cycle"]);
  });

  test("a 50,000-deep chain terminates without a stack overflow, bounded at the depth limit", () => {
    let root = node("leaf");
    for (let i = 0; i < 50_000; i++) root = node(`n${i}`, [root]);
    let count = 0;
    let stopReasons = 0;
    expect(() => {
      walkPreOrder([root], childrenOf, (_n, stop) => {
        count++;
        if (stop) stopReasons++;
      });
    }).not.toThrow();
    expect(count).toBe(10_001);
    expect(stopReasons).toBe(1);
  });

  test("a diamond (shared, non-cyclic) node is visited in full at both occurrences", () => {
    const shared = node("shared", [node("leaf")]);
    const tree = node("root", [node("left", [shared]), node("right", [shared])]);
    const stops: (string | undefined)[] = [];
    walkPreOrder([tree], childrenOf, (n, stop) => {
      if (n.id === "shared") stops.push(stop);
    });
    expect(stops).toEqual([undefined, undefined]);
  });
});
