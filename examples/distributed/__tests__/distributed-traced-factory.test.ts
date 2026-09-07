// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traceObject } from "@narrativetrace/proxy";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { InMemoryFraudService } from "../src/fraud-service.js";
import { createTracedContext } from "../src/traced-service-factory.js";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
});

afterEach(async () => {
  await provider.shutdown();
});

describe("createTracedContext", () => {
  test("returns context that captures traces", () => {
    const tracer = provider.getTracer("test");
    const ctx = createTracedContext(tracer);
    const svc = traceObject(new InMemoryFraudService(), ctx, undefined, {
      className: "FraudService",
    });

    svc.evaluate("C1", 100);

    const trace = ctx.captureTrace();
    expect(trace.roots).toHaveLength(1);
    expect(trace.roots[0].signature.className).toBe("FraudService");
    expect(trace.roots[0].signature.methodName).toBe("evaluate");
  });

  test("propagates service identity to span context", () => {
    const tracer = provider.getTracer("test");
    const ctx = createTracedContext(tracer, { serviceName: "fraud" });
    const svc = traceObject(new InMemoryFraudService(), ctx, undefined, {
      className: "FraudService",
    });

    svc.evaluate("C1", 100);

    const trace = ctx.captureTrace();
    expect(trace.roots[0].spanContext?.serviceName).toBe("fraud");
  });

  test("generates valid trace ID for each context", () => {
    const tracer = provider.getTracer("test");
    const ctx = createTracedContext(tracer);
    const svc = traceObject(new InMemoryFraudService(), ctx, undefined, {
      className: "FraudService",
    });

    svc.evaluate("C1", 100);

    const traceTree = ctx.captureTrace();
    expect(traceTree.roots[0].spanContext?.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  test("generates own trace ID when no active OTel span", () => {
    const tracer = provider.getTracer("test");
    const ctx = createTracedContext(tracer);
    const svc = traceObject(new InMemoryFraudService(), ctx, undefined, {
      className: "FraudService",
    });

    svc.evaluate("C1", 100);

    const traceTree = ctx.captureTrace();
    expect(traceTree.roots[0].spanContext?.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  test("creates OTel spans for traced methods", () => {
    const tracer = provider.getTracer("test");
    const ctx = createTracedContext(tracer);
    const svc = traceObject(new InMemoryFraudService(), ctx, undefined, {
      className: "FraudService",
    });

    svc.evaluate("C1", 100);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("FraudService.evaluate");
  });
});
