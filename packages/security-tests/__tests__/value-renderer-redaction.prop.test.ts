// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderStructured, renderValue } from "@narrativetrace/core";
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { hostileGraphCases } from "../src/corpus/hostile-corpus.js";
import { build, secret } from "../src/corpus/hostile-graphs.js";
import { carriesSecret, type GraphCase } from "../src/corpus/types.js";
import { everyOutput, treeOf } from "../src/oracle/emitters.js";
import {
  boundedSize,
  containsNoSentinel,
  freshSentinel,
  idempotent,
  noHandleLeft,
  withinBudget,
} from "../src/oracle/oracles.js";

/**
 * Target 2, and the reason the suite exists: the value renderer over hostile object graphs, with
 * the redaction oracle. Mirrors Java's `ValueRendererRedactionPropertyTest`.
 *
 * INTENT: redaction is the one rendering rule whose failure mode is a leak rather than an ugly
 * line. The oracle is mechanical: plant a random token behind `@notTraced`/the deny-list anywhere
 * in an arbitrary graph, render the graph, drive every emitter, and assert the token is in no byte
 * of any of them.
 */

function outputsFor(graph: unknown): Record<string, string> {
  const flat = renderValue(graph);
  return {
    "renderer:value-flat": flat,
    "renderer:value-structured": JSON.stringify(renderStructured(graph)),
    ...everyOutput(treeOf(flat, flat)),
  };
}

function assertContained(graphCase: GraphCase, sentinel = freshSentinel()): void {
  const graph = build(graphCase, sentinel);
  const outputs = withinBudget(`every output for ${graphCase.id}`, () => outputsFor(graph));
  containsNoSentinel(outputs, sentinel);
  boundedSize(outputs);
}

const LAYERS = [
  "optional",
  "atomicReference",
  "atomicReferenceArray",
  "entryValue",
  "entryKey",
  "future",
  "list",
  "array",
  "map",
  "record",
  "holder",
] as const;

const wrapperStacksArb = fc.array(fc.constantFrom(...LAYERS), { minLength: 0, maxLength: 6 });
const containersArb = fc.constantFrom("list", "listWithNulls", "array", "map");

function generatedStack(layers: readonly string[]): GraphCase {
  return {
    id: "generated",
    description: "generated stack",
    layers,
    n: 0,
    payload: "secret-record",
  };
}

describe("value renderer redaction", () => {
  test("every hostile graph keeps a redacted value out of every output", () => {
    for (const graphCase of hostileGraphCases()) {
      if (carriesSecret(graphCase)) assertContained(graphCase);
    }
  });

  test("every hostile graph renders without throwing and in bounded time", () => {
    for (const graphCase of hostileGraphCases()) {
      const graph = build(graphCase, freshSentinel());
      withinBudget(`render ${graphCase.id}`, () => renderValue(graph));
      withinBudget(`renderStructured ${graphCase.id}`, () => renderStructured(graph));
    }
  });

  test("a redacted component shows the marker rather than nothing", () => {
    const sentinel = freshSentinel();
    const rendered = renderValue(secret(sentinel));

    expect(rendered).toContain("[REDACTED]");
    expect(rendered).not.toContain(sentinel);
  });

  test("rendering is idempotent for every hostile graph", () => {
    for (const graphCase of hostileGraphCases()) {
      const graph = build(graphCase, freshSentinel());
      idempotent(`render ${graphCase.id}`, () => renderValue(graph));
    }
  });

  test("rendering starts no background timer or handle", () => {
    noHandleLeft(() => {
      for (const graphCase of hostileGraphCases()) renderValue(build(graphCase, freshSentinel()));
    });
  });

  test("a redacted component survives any stack of wrappers", () => {
    fc.assert(
      fc.property(wrapperStacksArb, (layers) => {
        assertContained(generatedStack(layers));
      }),
      { numRuns: 120 },
    );
  });

  test("the structured path redacts wherever the flat path does", () => {
    fc.assert(
      fc.property(wrapperStacksArb, (layers) => {
        const sentinel = freshSentinel();
        const graph = build(generatedStack(layers), sentinel);
        expect(JSON.stringify(renderStructured(graph))).not.toContain(sentinel);
      }),
      { numRuns: 120 },
    );
  });

  test("a redacted component survives an arbitrarily deep chain", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (depth) => {
        assertContained({
          id: "generated-depth",
          description: "generated chain",
          kind: "repeatLayer",
          layers: [],
          layer: "holder",
          n: depth,
          payload: "secret-record",
        });
      }),
      { numRuns: 50 },
    );
  });

  test("a redacted component survives an arbitrarily wide container", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), containersArb, (width, container) => {
        assertContained({
          id: "generated-width",
          description: "generated width",
          kind: "width",
          layers: [],
          container,
          n: width,
          payload: "secret-record",
        });
      }),
      { numRuns: 30 },
    );
  });
});
