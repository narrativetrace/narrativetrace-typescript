// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import {
  createBrowserNarrativeContext,
  DEFAULT_BROWSER_BUFFER_CAPACITY,
} from "../src/browser-context.js";

function traceCalls(ctx: { enterMethod: Function; exitMethodWithReturn: Function }, n: number) {
  for (let i = 0; i < n; i++) {
    const span = ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null, span);
  }
}

describe("createBrowserNarrativeContext", () => {
  test("the seam's default is 2048, argued in its own doc comment", () => {
    expect(DEFAULT_BROWSER_BUFFER_CAPACITY).toBe(2048);
  });

  test("bufferCapacity override actually resizes the ring, not just accepted and ignored", () => {
    // 5 calls = 10 events; a 2-slot ring must shed, a 1000-slot ring must not.
    const small = createBrowserNarrativeContext(new NarrativeTraceConfig("detail"), {
      bufferCapacity: 2,
    });
    traceCalls(small, 5);
    expect(small.traceLoss().droppedEvents).toBeGreaterThan(0);

    const large = createBrowserNarrativeContext(new NarrativeTraceConfig("detail"), {
      bufferCapacity: 1000,
    });
    traceCalls(large, 5);
    expect(large.traceLoss().droppedEvents).toBe(0);
  });

  test("an explicit pipeline overrides bufferCapacity — sizing becomes the caller's job", () => {
    const roomyPipeline = new DualPathPipeline(null, new BufferedEventConsumer(1000));
    const ctx = createBrowserNarrativeContext(new NarrativeTraceConfig("detail"), {
      bufferCapacity: 2,
      pipeline: roomyPipeline,
    });
    traceCalls(ctx, 5);
    expect(ctx.traceLoss().droppedEvents).toBe(0);
    expect(ctx.eventPipeline).toBe(roomyPipeline);
  });

  test("serviceIdentity reaches captured spans", () => {
    const ctx = createBrowserNarrativeContext(new NarrativeTraceConfig("detail"), {
      serviceIdentity: { serviceName: "checkout" },
    });
    traceCalls(ctx, 1);
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.spanContext.serviceName).toBe("checkout");
  });
});
