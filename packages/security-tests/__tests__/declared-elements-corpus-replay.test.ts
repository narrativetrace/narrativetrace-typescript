// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderStructured, renderValue } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { hostileGraphCases } from "../src/corpus/hostile-corpus.js";
import {
  build as buildGraph,
  declaredElements,
  userSubclassAncestorState,
} from "../src/corpus/hostile-graphs.js";
import type {
  AncestorStateList,
  AncestorStateMap,
  DeclaredElementsIterable,
  DeclaredElementsMap,
} from "../src/corpus/hostile-members.js";

// Corpus replay for the two master rows that pin the origin decision's element side on BOTH
// rendering paths (the twin of Java's DeclaredElementsCorpusReplayTest): `declared-elements`
// (the third sanctioned hook) and `structured-path-user-subclass-ancestor-state` (a user subclass
// of a platform list and map, read through the ancestor's own state). The both-paths verdict
// parity is asserted per row elsewhere; this file asserts what that coarse verdict cannot: the
// SAME elements under the SAME cap were shown, and the fixture's own members did or did not run.
// The two paths encode a cap differently (a trailing marker in text, a shorter list in the tree),
// so the witness is the set of element markers present, not the shape of the rendering.

const DECLARED_ROW = "declared-elements";
const SUBCLASS_ROW = "structured-path-user-subclass-ancestor-state";

function row(id: string, sentinel: string): unknown {
  const graphCase = hostileGraphCases().find((c) => c.id === id);
  if (graphCase === undefined) throw new Error(`no graphs.json row with id ${id}`);
  return buildGraph(graphCase, sentinel);
}

const both = (graph: () => unknown): { flat: string; structured: string } => ({
  flat: renderValue(graph()),
  structured: JSON.stringify(renderStructured(graph())),
});

describe("declared-elements and structured-path-user-subclass-ancestor-state, both paths", () => {
  test("declared elements show the same elements under the same cap on both paths", () => {
    const { flat, structured } = both(() => row(DECLARED_ROW, "sentinel-declared"));
    for (const text of [flat, structured]) {
      for (const shown of ["elem-1", "elem-4", "entry-key-0", "entry-key-4"]) {
        expect(text).toContain(shown);
      }
      for (const capped of ["elem-5", "elem-6", "entry-key-5", "entry-key-6"]) {
        expect(text).not.toContain(capped);
      }
      expect(text).not.toContain("sentinel-declared");
    }
  });

  test("a raising declared hook renders the typed error marker on both paths", () => {
    const { flat, structured } = both(() => row(DECLARED_ROW, "sentinel-declared-raise"));
    expect(flat).toContain("<error: RangeError>");
    expect(structured).toContain("<error: RangeError>");
  });

  test("a user subclass of a platform list and map shows ancestor state on both paths", () => {
    const { flat, structured } = both(() => row(SUBCLASS_ROW, "sentinel-subclass"));
    for (const text of [flat, structured]) {
      expect(text).toContain("ancestor-list-element");
      expect(text).toContain("ancestor-map-value");
      expect(text).not.toContain("sentinel-subclass");
      expect(text).not.toContain("<error");
    }
  });

  test.each([
    ["flat", renderValue],
    ["structured", renderStructured],
  ])("on the %s path the hooks run once under the guard and the overrides never run", (_name, render) => {
    const declared = declaredElements("sentinel-hook-counts");
    render(declared);
    const iterable = declared[0] as DeclaredElementsIterable;
    const map = declared[1] as DeclaredElementsMap;
    expect(iterable.hookCalls).toBe(1);
    expect(iterable.guardActiveDuringHook).toBe(true);
    expect(map.hookCalls).toBe(1);
    expect(map.guardActiveDuringHook).toBe(true);

    const subclasses = userSubclassAncestorState("sentinel-override-counts");
    render(subclasses);
    expect((subclasses[0] as AncestorStateList).overrideCalls).toBe(0);
    expect((subclasses[1] as AncestorStateMap).overrideCalls).toBe(0);
  });
});
