// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  AsyncNarrativeContext,
  NarrativeTraceConfig,
  parameterCapture,
  parseTraceparent,
} from "../src/index.js";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const CALLER_SPAN = "00f067aa0ba902b7";
const HEADER = `00-${TRACE_ID}-${CALLER_SPAN}-01`;

function rootOf(ctx: AsyncNarrativeContext) {
  const span = ctx.enterMethod("Svc", "op", [parameterCapture("id", '"x"', false)]);
  ctx.exitMethodWithReturn("ok", span);
  return ctx.captureTrace().roots[0]?.spanContext;
}

describe("adopting an inbound traceparent", () => {
  test("the adopted root records the header's parent span as its parent", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const root = ctx.run(() => rootOf(ctx), parseTraceparent(HEADER));

    expect(root?.traceId).toBe(TRACE_ID);
    expect(root?.parentSpanId).toBe(CALLER_SPAN);
  });

  test("an invalid header adopts nothing and leaves the root parentless", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const root = ctx.run(() => rootOf(ctx), parseTraceparent("not-a-traceparent"));

    expect(root?.traceId).not.toBe(TRACE_ID);
    expect(root?.parentSpanId).toBeNull();
  });

  test("a bare trace id still joins the trace with no parent span", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const root = ctx.run(() => rootOf(ctx), TRACE_ID as never);

    expect(root?.traceId).toBe(TRACE_ID);
    expect(root?.parentSpanId).toBeNull();
  });
});
