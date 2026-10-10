// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, describe, expect, test } from "vitest";
import { narrativePipeline } from "./narrative-pipeline.js";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

afterEach(() => exporter.reset());

describe("the opentelemetry row's wiring snippet", () => {
  test("turns every traced call into a span of the project's own tracer", () => {
    const tracer = provider.getTracer("orders");
    const context = new SyncNarrativeContext(
      new NarrativeTraceConfig(),
      undefined,
      narrativePipeline(tracer),
    );

    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn("ORD-1");

    expect(exporter.getFinishedSpans().map((span) => span.name)).toEqual([
      "OrderService.placeOrder",
    ]);
    expect(context.captureTrace().roots[0]?.signature.methodName).toBe("placeOrder");
  });
});
