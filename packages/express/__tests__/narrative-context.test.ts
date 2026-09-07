// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core";
import { NarrativeTraceConfig } from "@narrativetrace/core-node";
import { describe, expect, test } from "vitest";
import {
  createExpressNarrativeContext,
  DEFAULT_EXPRESS_BUFFER_CAPACITY,
} from "../src/narrative-context.js";

function traceCalls(ctx: { enterMethod: Function; exitMethodWithReturn: Function }, n: number) {
  for (let i = 0; i < n; i++) {
    const span = ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null, span);
  }
}

describe("createExpressNarrativeContext", () => {
  test("the seam's default is 8192, argued in its own doc comment", () => {
    expect(DEFAULT_EXPRESS_BUFFER_CAPACITY).toBe(8192);
  });

  test("bufferCapacity override actually resizes the ring, not just accepted and ignored", () => {
    // 5 calls = 10 events; a 2-slot ring must shed, a 1000-slot ring must not.
    const small = createExpressNarrativeContext(new NarrativeTraceConfig("detail"), {
      bufferCapacity: 2,
    });
    traceCalls(small, 5);
    expect(small.traceLoss().droppedEvents).toBeGreaterThan(0);

    const large = createExpressNarrativeContext(new NarrativeTraceConfig("detail"), {
      bufferCapacity: 1000,
    });
    traceCalls(large, 5);
    expect(large.traceLoss().droppedEvents).toBe(0);
  });

  test("an explicit pipeline overrides bufferCapacity — sizing becomes the caller's job", () => {
    const roomyPipeline = new DualPathPipeline(null, new BufferedEventConsumer(1000));
    const ctx = createExpressNarrativeContext(new NarrativeTraceConfig("detail"), {
      bufferCapacity: 2,
      pipeline: roomyPipeline,
    });
    traceCalls(ctx, 5);
    expect(ctx.traceLoss().droppedEvents).toBe(0);
    expect(ctx.eventPipeline).toBe(roomyPipeline);
  });

  test("serviceIdentity reaches captured spans", () => {
    const ctx = createExpressNarrativeContext(new NarrativeTraceConfig("detail"), {
      serviceIdentity: { serviceName: "checkout" },
    });
    traceCalls(ctx, 1);
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.spanContext.serviceName).toBe("checkout");
  });
});
