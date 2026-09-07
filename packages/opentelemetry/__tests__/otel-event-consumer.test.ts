// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClientIp, HttpRoute, SpanId, TraceEvent, TraceId } from "@narrativetrace/core";
import {
  incomplete,
  methodSignature,
  parameterCapture,
  returned,
  spanContext,
  threw,
} from "@narrativetrace/core";
import { SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createOtelEventConsumer } from "../src/otel-event-consumer.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function sc(spanId: SpanId, parentSpanId: SpanId | null = null) {
  return spanContext(traceId, spanId, parentSpanId);
}

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

function enterEvent(
  n: number,
  className: string,
  methodName: string,
  parentN: number | null = null,
): TraceEvent {
  return {
    type: "enter",
    spanContext: sc(sid(n), parentN !== null ? sid(parentN) : null),
    timestamp: performance.now(),
    signature: methodSignature(className, methodName, []),
  };
}

describe("createOtelEventConsumer", () => {
  test("enter + exit creates one finished span", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });

    consumer(enterEvent(0, "OrderService", "placeOrder"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: returned('"OK"'),
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("OrderService.placeOrder");
  });

  test("a returned outcome emits the rendered value as narrative.outcome", () => {
    const consumer = createOtelEventConsumer({ tracer: provider.getTracer("test") });
    consumer(enterEvent(0, "Svc", "op"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: returned('"OK"'),
    });
    expect(exporter.getFinishedSpans()[0]?.attributes["narrative.outcome"]).toBe('"OK"');
  });

  test("an incomplete outcome is tagged in-flight, not OK", () => {
    const consumer = createOtelEventConsumer({ tracer: provider.getTracer("test") });
    consumer(enterEvent(0, "Svc", "op"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: incomplete(),
    });
    const span = exporter.getFinishedSpans()[0];
    expect(span?.attributes["narrative.outcome"]).toBe("in-flight");
    expect(span?.status.code).not.toBe(SpanStatusCode.OK);
  });

  test("exit with return sets OK status", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });

    consumer(enterEvent(0, "Svc", "op"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: returned(null),
    });

    expect(exporter.getFinishedSpans()[0].status.code).toBe(SpanStatusCode.OK);
  });

  test("span start/end anchor to the enter/exit event timestamps (TS-OTEL-8)", () => {
    // Timestamps must sit unambiguously on ONE side of OpenTelemetry's `getTimeOrigin()`
    // heuristic: a number below it is read as performance-relative, at or above it as epoch
    // millis. Small literals (1000/1250) straddled that boundary depending on the worker's
    // time origin, so start and end were read on different clocks — a negative duration, which
    // the SDK clamps to 0. Epoch-based values are always >= the process start time.
    const start = Date.now();
    const consumer = createOtelEventConsumer({ tracer: provider.getTracer("test") });
    consumer({
      type: "enter",
      spanContext: sc(sid(0)),
      timestamp: start,
      signature: methodSignature("Svc", "op", []),
    });
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: start + 250,
      outcome: returned("1"),
    });

    const span = exporter.getFinishedSpans()[0];
    const durationMs = span.duration[0] * 1000 + span.duration[1] / 1e6;
    expect(Math.round(durationMs)).toBe(250);
  });

  test("a child span also carries nt.trace_id and nt.* schema (TS-OTEL-9/10)", () => {
    const consumer = createOtelEventConsumer({ tracer: provider.getTracer("test") });
    consumer(enterEvent(0, "Root", "run"));
    consumer(enterEvent(1, "Child", "work", 0));
    consumer({
      type: "exit",
      spanContext: sc(sid(1), sid(0)),
      timestamp: performance.now(),
      outcome: returned("1"),
    });
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: returned("2"),
    });

    const child = exporter.getFinishedSpans().find((s) => s.name === "Child.work");
    expect(child?.attributes["nt.trace_id"]).toBe(traceId);
    expect(child?.attributes["nt.entryType"]).toBe("entry");
    expect(child?.attributes["nt.schemaVersion"]).toBe("1.0");
  });

  test("typed param attributes: number, boolean and quoted-string inference (TS-OTEL-7)", () => {
    const consumer = createOtelEventConsumer({ tracer: provider.getTracer("test") });
    consumer({
      type: "enter",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      signature: methodSignature("Svc", "op", [
        parameterCapture("count", "42", false),
        parameterCapture("active", "true", false),
        parameterCapture("name", '"alice"', false),
        parameterCapture("secret", "hunter2", true),
      ]),
    });
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: returned("1"),
    });

    const attrs = exporter.getFinishedSpans()[0].attributes;
    expect(attrs["narrative.param.count"]).toBe(42);
    expect(attrs["narrative.param.active"]).toBe(true);
    expect(attrs["narrative.param.name"]).toBe("alice");
    expect(attrs["narrative.param.secret"]).toBeUndefined();
  });

  test("parent span records a completion event per child (TS-OTEL-6)", () => {
    const consumer = createOtelEventConsumer({ tracer: provider.getTracer("test") });
    consumer(enterEvent(0, "Root", "run"));
    consumer({
      type: "enter",
      spanContext: sc(sid(1), sid(0)),
      timestamp: performance.now(),
      signature: methodSignature("Child", "work", [parameterCapture("id", "7", false)]),
    });
    consumer({
      type: "exit",
      spanContext: sc(sid(1), sid(0)),
      timestamp: performance.now(),
      outcome: returned('"done"'),
    });
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: returned("2"),
    });

    const root = exporter.getFinishedSpans().find((s) => s.name === "Root.run");
    expect(root?.events).toHaveLength(1);
    expect(root?.events[0].name).toBe("Child.work");
    expect(root?.events[0].attributes?.["narrative.param.id"]).toBe(7);
    expect(root?.events[0].attributes?.["narrative.outcome"]).toBe('"done"');
  });

  test("exit with exception sets ERROR status and records exception", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });

    consumer(enterEvent(0, "Svc", "op"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: threw(new Error("boom")),
    });

    const span = exporter.getFinishedSpans()[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe("boom");
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe("exception");
  });

  test("nested calls create parent-child span hierarchy", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });

    consumer(enterEvent(0, "OrderService", "placeOrder"));
    consumer(enterEvent(1, "PaymentService", "charge", 0));
    consumer({
      type: "exit",
      spanContext: sc(sid(1), sid(0)),
      timestamp: performance.now(),
      outcome: returned('"OK"'),
    });
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: returned('"done"'),
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    const child = spans.find((s) => s.name === "PaymentService.charge");
    const parent = spans.find((s) => s.name === "OrderService.placeOrder");
    expect(child?.parentSpanId).toBe(parent?.spanContext().spanId);
  });

  test("exit with non-Error thrown value stringifies it", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });

    consumer(enterEvent(0, "Svc", "op"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: performance.now(),
      outcome: threw("string-error"),
    });

    const span = exporter.getFinishedSpans()[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe("string-error");
  });

  test("enter with unknown parentSpanId falls back to active context", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });

    // parentSpanId 99 was never entered — consumer should not crash
    consumer(enterEvent(0, "Svc", "op", 99));
    consumer({
      type: "exit",
      spanContext: sc(sid(0), sid(99)),
      timestamp: performance.now(),
      outcome: returned(null),
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("Svc.op");
  });

  test("exit without matching enter creates orphan error span", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });

    consumer({
      type: "exit",
      spanContext: sc(sid(99)),
      timestamp: performance.now(),
      outcome: returned(null),
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe("orphaned — enter event lost");
  });

  test("root span has trace-level attributes, child span does not", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({ tracer });
    const rootSc = spanContext(
      traceId,
      sid(0),
      null,
      {
        serviceName: "order-service",
      },
      {
        httpMethod: "POST",
        httpRoute: "/api/orders" as HttpRoute,
        clientIp: "10.0.0.1" as ClientIp,
      },
    );
    const childSc = spanContext(
      traceId,
      sid(1),
      sid(0),
      {
        serviceName: "order-service",
      },
      {
        httpMethod: "POST",
        httpRoute: "/api/orders" as HttpRoute,
        clientIp: "10.0.0.1" as ClientIp,
      },
    );

    consumer({
      type: "enter",
      spanContext: rootSc,
      timestamp: performance.now(),
      signature: methodSignature("OrderService", "placeOrder", []),
    });
    consumer({
      type: "enter",
      spanContext: childSc,
      timestamp: performance.now(),
      signature: methodSignature("PaymentService", "charge", []),
    });
    consumer({
      type: "exit",
      spanContext: childSc,
      timestamp: performance.now(),
      outcome: returned('"OK"'),
    });
    consumer({
      type: "exit",
      spanContext: rootSc,
      timestamp: performance.now(),
      outcome: returned('"done"'),
    });

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === "OrderService.placeOrder");
    const child = spans.find((s) => s.name === "PaymentService.charge");

    expect(root?.attributes["nt.service.name"]).toBe("order-service");
    expect(root?.attributes["nt.http.method"]).toBe("POST");
    expect(root?.attributes["code.namespace"]).toBe("OrderService");

    expect(child?.attributes["nt.service.name"]).toBeUndefined();
    expect(child?.attributes["nt.http.method"]).toBeUndefined();
    expect(child?.attributes["code.namespace"]).toBe("PaymentService");
  });

  test("enter without exit is evicted as orphan after TTL", () => {
    let now = 0;
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({
      tracer,
      maxActiveSpans: 1024,
      spanTtlMs: 100,
      clock: () => now,
    });

    consumer(enterEvent(0, "Svc", "op"));
    now = 101;
    consumer(enterEvent(1, "Svc", "other"));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("Svc.op");
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe("orphaned — exit event lost");
  });

  test("capacity eviction produces orphan error span", () => {
    const tracer = provider.getTracer("test");
    const consumer = createOtelEventConsumer({
      tracer,
      maxActiveSpans: 1,
      spanTtlMs: 60_000,
    });

    consumer(enterEvent(0, "Svc", "first"));
    consumer(enterEvent(1, "Svc", "second"));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("Svc.first");
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe("orphaned — exit event lost");
  });
});
