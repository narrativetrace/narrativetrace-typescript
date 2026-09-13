// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { isValidSpanId, parameterCapture, renderValue } from "@narrativetrace/core";
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-node";
import { describe, expect, test } from "vitest";

// Independent of src/index.ts (the hand-run entry point for documentation/llms-full.md's
// "Core API Reference" — never imported here, same reasoning as
// examples/sixty-seconds/vitest.config.ts): this test drives the identical enterMethod /
// exitMethodWithReturn / exitMethodWithException sequence through its own context, and pins the
// two facts the doc's snippet exists to demonstrate — enterMethod returns a real SpanId, and the
// exit calls resolve the frame THAT handle names, not merely "whatever is on top of the stack".
describe("the raw NarrativeContext API the doc snippet demonstrates", () => {
  test("enterMethod returns a SpanId; exitMethodWithReturn(rendered, handle) resolves that frame", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig());

    const handle = context.enterMethod("OrderService", "placeOrder", [
      parameterCapture("customerId", renderValue("C1"), false),
      parameterCapture("quantity", renderValue(2), false),
    ]);
    expect(isValidSpanId(handle)).toBe(true);

    context.exitMethodWithReturn(renderValue("ORD-C1-2"), handle);

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(1);
    const root = tree.roots[0];
    expect(root?.signature.className).toBe("OrderService");
    expect(root?.signature.methodName).toBe("placeOrder");
    expect(root?.outcome.kind).toBe("returned");
    expect(root?.outcome.kind === "returned" && root.outcome.renderedValue).toBe('"ORD-C1-2"');
  });

  test("exitMethodWithException(error, handle) resolves the same frame as a failure", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig());

    const handle = context.enterMethod("OrderService", "placeOrder", []);
    const error = new Error("out of stock");
    context.exitMethodWithException(error, handle);

    const tree = context.captureTrace();
    const outcome = tree.roots[0]?.outcome;
    expect(outcome?.kind).toBe("threw");
    expect(outcome?.kind === "threw" && outcome.error).toBe(error);
  });
});
