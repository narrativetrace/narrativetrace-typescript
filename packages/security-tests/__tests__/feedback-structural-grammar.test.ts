// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type ConcurrencyKind,
  concurrencyInfo,
  incomplete,
  methodSignature,
  renderStructuralDocument,
  returned,
  type TraceNode,
  type TraceOutcome,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { looksStructural } from "@narrativetrace/tooling";
import { describe, expect, test } from "vitest";
import { hostileTraceShapes } from "../src/corpus/hostile-corpus.js";
import { build as buildTraceShape } from "../src/corpus/trace-shapes.js";

/**
 * The grammar the feedback verb decides attachments by, held against the renderer that writes the
 * artifact — the parallel-path parity this repository's own test rules ask for.
 *
 * INTENT: `looksStructural` lives in the zero-dependency tooling layer and so cannot import the
 * renderer; the renderer cannot import the grammar either. Two independent readings of one file
 * format, in two packages that may not see each other, is exactly the shape that drifts — and the
 * failure mode is silent: the verb simply stops attaching a trace and reports that it found none
 * attachable. This package is the one that may see both.
 *
 * @llmNote Every outcome kind and every concurrency marker the renderer can emit is driven through
 * here, not a happy-path tree. The markers (`~ fork [n]`, `~ async [n]`, `~ fire-and-forget`) and
 * the walk markers (`… (cycle)`, `… (depth limit)`) are precisely the shapes the Java reference's
 * grammar does not have, so they are the shapes this port had to add — and can therefore lose.
 */

function node(
  name: string,
  outcome: TraceOutcome,
  children: readonly TraceNode[] = [],
  group?: { readonly id: string; readonly kind: ConcurrencyKind },
): TraceNode {
  return traceNode(
    methodSignature("OrderService", name, [{ name: "customerId" }, { name: "total" }]),
    outcome,
    children,
    0,
    0,
    group === undefined ? undefined : concurrencyInfo(group.id, name, group.kind),
  );
}

function groupOf(kind: ConcurrencyKind, names: readonly string[]): TraceNode[] {
  return names.map((name) => node(name, returned(null), [], { id: `g-${kind}`, kind }));
}

describe("the renderer's structural artifact satisfies the grammar the verb attaches by", () => {
  test("a tree carrying every outcome kind renders to something attachable", () => {
    const tree = traceTree([
      node("placeOrder", returned("value"), [
        node("reserve", returned(null)),
        node("quote", threw(new RangeError("out of range"))),
        node("settle", incomplete()),
      ]),
    ]);

    const document = renderStructuralDocument(tree, "Order is placed");

    expect(document, document).toSatisfy(looksStructural);
  });

  test.each([
    "fork-join",
    "async",
    "fire-and-forget",
  ] as const)("a %s group's marker line renders to something attachable", (kind) => {
    const tree = traceTree([
      node("placeOrder", returned(null), groupOf(kind, ["reserve", "quote"])),
    ]);

    const document = renderStructuralDocument(tree, "Order is placed concurrently");

    expect(document, document).toSatisfy(looksStructural);
  });

  test.each(
    hostileTraceShapes().map((shape) => [shape.id, shape] as const),
  )("a hostile call-tree shape renders to something attachable: %s", (_id, shape) => {
    const document = renderStructuralDocument(buildTraceShape(shape), "Hostile shape");

    expect(document, document).toSatisfy(looksStructural);
  });

  /**
   * Without this the cycle rows above would pass whether or not the walk marker is reached, and
   * the marker is the one shape whose own parentheses defeat a naive call-line parse.
   */
  test("a cyclic tree really does emit the walk marker the grammar had to learn", () => {
    const cyclic = hostileTraceShapes().find((shape) => shape.kind === "cycle");
    const document = renderStructuralDocument(
      buildTraceShape(cyclic as NonNullable<typeof cyclic>),
      "Hostile shape",
    );

    expect(document).toContain("… (cycle)");
    expect(document, document).toSatisfy(looksStructural);
  });

  /**
   * The renderer only folds CONTROL characters, so an identifier in any script reaches the artifact
   * verbatim. A grammar with ASCII-only identifiers refused the whole file, which meant a project
   * naming its code in a non-Latin script could never attach a trace to a problem report.
   */
  test("a project written in a non-Latin script renders to something attachable", () => {
    const tree = traceTree([
      traceNode(
        methodSignature("注文Service", "注文する", [{ name: "顧客id" }, { name: "合計" }]),
        returned("value"),
        [],
      ),
    ]);

    const document = renderStructuralDocument(tree, "注文が登録される");

    expect(document).toContain("- 注文Service.注文する(顧客id, 合計) → value");
    expect(document, document).toSatisfy(looksStructural);
  });

  test("the grammar is not vacuous: a rendered narrative is not attachable", () => {
    expect(
      'scenario: Order is placed\n\n- OrderService.placeOrder(customerId: "C-1") → "ORD-1" — 1ms\n',
    ).not.toSatisfy(looksStructural);
  });
});
