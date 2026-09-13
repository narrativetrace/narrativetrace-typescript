// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { parameterCapture, renderMarkdownBody, renderValue } from "@narrativetrace/core";
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-node";

// Backs the "Core API Reference" section of documentation/llms-full.md (<!-- snippet: -->
// embedded, checked by `pnpm run snippet-check` — never hand-copied there). This is the raw
// NarrativeContext surface `traceObject()` calls on your behalf: `enterMethod` returns the
// SpanId of the frame it just pushed, and both exit calls take that handle back so the context
// can pop the right frame even when calls interleave (concurrent/async work, a frame entered by
// one call and exited by another). A framework integration that cannot wrap its target in a
// Proxy — a decorator, a custom object model — calls this directly instead.
const context = new SyncNarrativeContext(new NarrativeTraceConfig());

function placeOrder(customerId: string, quantity: number): string {
  const handle = context.enterMethod("OrderService", "placeOrder", [
    parameterCapture("customerId", renderValue(customerId), false),
    parameterCapture("quantity", renderValue(quantity), false),
  ]);
  try {
    const orderId = `ORD-${customerId}-${quantity}`;
    context.exitMethodWithReturn(renderValue(orderId), handle);
    return orderId;
  } catch (error) {
    context.exitMethodWithException(error, handle);
    throw error;
  }
}

placeOrder("C1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
