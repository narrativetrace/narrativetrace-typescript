// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { RenderedValue } from "../src/rendered-value.js";
import { renderStructured } from "../src/rendered-value.js";
import { renderCapture, renderValue } from "../src/value-renderer.js";

// B-185 / ADV-2026-10-23-1 — twin of Java's ValueRendererSharedSubgraphBudgetTest. Rendering a
// value may never cost more than the value is: the output is bounded by the number of DISTINCT
// objects in a graph and by a total node budget, never by the number of paths through it.
// The constants pinned here are Java's (RenderWalk.MAX_DEPTH = 32, MAX_NODES = 1024).
const MAX_DEPTH = 32;
const MAX_NODES = 1024;
const MAX_CHARACTERS = 64 * 1024;
const MAX_STRUCTURED_NODES = 4096;
const WIDE = { maxDepth: MAX_DEPTH } as const;

/** Two fields, one referent: shared, never cyclic, so no cycle guard may refuse it. */
class Rung {
  readonly left: unknown;
  readonly right: unknown;
  constructor(next: unknown) {
    this.left = next;
    this.right = next;
  }
}

/** `rungs + 1` distinct objects, 2^rungs paths. */
function ladder(rungs: number): unknown {
  let current: unknown = "leaf";
  for (let i = 0; i < rungs; i++) current = new Rung(current);
  return current;
}

/** A five-wide tree of distinct arrays, `levels` deep: no sharing at all. */
function distinctTree(levels: number): unknown {
  if (levels === 0) return "leaf";
  return Array.from({ length: 5 }, () => distinctTree(levels - 1));
}

function countNodes(value: RenderedValue): number {
  if (value.kind === "object") {
    return 1 + Object.values(value.fields).reduce((sum, v) => sum + countNodes(v), 0);
  }
  if (value.kind === "list") return 1 + value.items.reduce((sum, v) => sum + countNodes(v), 0);
  return 1;
}

function countMarker(value: RenderedValue, text: string): number {
  if (value.kind === "object") {
    return Object.values(value.fields).reduce((sum, v) => sum + countMarker(v, text), 0);
  }
  if (value.kind === "list") return value.items.reduce((sum, v) => sum + countMarker(v, text), 0);
  return (value.kind === "other" && value.text === text) ||
    (value.kind === "string" && value.value === text)
    ? 1
    : 0;
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("B-185 shared-subgraph render bound", () => {
  test("a 17-object ladder renders within a bounded ceiling (flat)", () => {
    const rendered = renderValue(ladder(16));
    expect(rendered.length).toBeLessThan(MAX_CHARACTERS);
  });

  test("a 17-object ladder renders within a bounded ceiling (capture path)", () => {
    expect(renderCapture(ladder(16)).rendered.length).toBeLessThan(MAX_CHARACTERS);
  });

  test("the structured path bounds the same ladder at the Java depth cap", () => {
    const nodes = countNodes(renderStructured(ladder(16), WIDE));
    expect(nodes).toBeLessThan(MAX_STRUCTURED_NODES);
  });

  test("a depth-20 ladder renders in linear size on both paths, quickly", () => {
    const start = Date.now();
    const graph = ladder(20);
    const flat = renderValue(graph);
    const nodes = countNodes(renderStructured(graph, WIDE));
    expect(flat.length).toBeLessThan(4096);
    expect(nodes).toBeLessThan(4 * 21);
    expect(Date.now() - start).toBeLessThan(10_000);
  }, 10_000);

  test("a ladder as deep as the depth cap renders in linear size on both paths, quickly", () => {
    const start = Date.now();
    const graph = ladder(MAX_DEPTH);
    const flat = renderValue(graph);
    const nodes = countNodes(renderStructured(graph, WIDE));
    expect(flat.length).toBeLessThan(8192);
    expect(nodes).toBeLessThan(4 * 33);
    expect(Date.now() - start).toBeLessThan(10_000);
  }, 10_000);

  test("a repeated instance renders as a back-reference, the same on both paths", () => {
    const graph = ladder(4);
    const flat = renderValue(graph);
    const structured = renderStructured(graph, WIDE);
    expect(flat).toContain("<repeat: Rung>");
    expect(occurrences(flat, "<repeat: Rung>")).toBe(countMarker(structured, "<repeat: Rung>"));
    expect(countMarker(structured, "<repeat: Rung>")).toBeGreaterThan(0);
  });

  test("a small shared value repeats inline, as before (the diamond row is unchanged)", () => {
    const shared = { a: 1 };
    const flat = renderValue([shared, shared]);
    expect(flat).toBe('[{"a": 1}, {"a": 1}]');
    expect(flat).not.toContain("<repeat");
  });

  test("an unshared graph past the total budget ends in the node-budget marker", () => {
    const tree = distinctTree(6);
    const start = Date.now();
    const flat = renderValue(tree);
    const structured = renderStructured(tree, WIDE);
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(flat).toContain("<max-nodes>");
    expect(countMarker(structured, "<max-nodes>")).toBeGreaterThan(0);
    expect(countNodes(structured)).toBeLessThan(MAX_NODES + 5 * MAX_DEPTH);
  }, 10_000);

  test("the flat budget counts scalars too, so both paths decide alike", () => {
    const tree = distinctTree(6);
    const flat = renderValue(tree);
    const structured = renderStructured(tree, WIDE);
    expect(occurrences(flat, "<max-nodes>")).toBe(countMarker(structured, "<max-nodes>"));
  });
});
