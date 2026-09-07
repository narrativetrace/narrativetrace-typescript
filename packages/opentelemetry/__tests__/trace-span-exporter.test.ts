// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanId, TraceId } from "@narrativetrace/core";
import {
  methodSignature,
  parameterCapture,
  returned,
  spanContext,
  threw,
  traceNode,
} from "@narrativetrace/core";
import { SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { TraceSpanExporter } from "../src/trace-span-exporter.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  provider.register();
});

afterEach(async () => {
  await provider.shutdown();
});

describe("TraceSpanExporter", () => {
  test("exports a node tree with duration, identity and nested child spans", () => {
    const child = traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "100", false)]),
      returned('"OK"'),
      [],
      50,
      1050,
      undefined,
      spanContext(traceId, sid(1), sid(0)),
    );
    const root = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      returned('"done"'),
      [child],
      200,
      1000,
      undefined,
      spanContext(traceId, sid(0), null, { serviceName: "orders" }),
    );

    new TraceSpanExporter(provider.getTracer("test")).export([root]);

    const spans = exporter.getFinishedSpans();
    const rootSpan = spans.find((s) => s.name === "OrderService.placeOrder");
    const childSpan = spans.find((s) => s.name === "PaymentService.charge");

    expect(rootSpan?.attributes["narrative.duration_ms"]).toBe(200);
    expect(rootSpan?.attributes["nt.trace_id"]).toBe(traceId);
    expect(rootSpan?.attributes["nt.service.name"]).toBe("orders");
    // Child span exists and its trace-level attrs are NOT set (root-only).
    expect(childSpan?.attributes["narrative.duration_ms"]).toBe(50);
    expect(childSpan?.attributes["nt.service.name"]).toBeUndefined();
    // Parent records a completion event for the child.
    expect(rootSpan?.events.some((e) => e.name === "PaymentService.charge")).toBe(true);
    // Child is nested under the root.
    expect(childSpan?.parentSpanContext?.spanId).toBe(rootSpan?.spanContext.spanId);
  });

  test("a thrown node exports ERROR status and records the exception", () => {
    const root = traceNode(
      methodSignature("Svc", "op", []),
      threw(new Error("boom")),
      [],
      10,
      0,
      undefined,
      spanContext(traceId, sid(0), null),
    );

    new TraceSpanExporter(provider.getTracer("test")).export([root]);

    const span = exporter.getFinishedSpans()[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.some((e) => e.name === "exception")).toBe(true);
  });
  test("anchors span start and end to the node's recorded timing", () => {
    // Epoch-based so OpenTelemetry's getTimeOrigin() heuristic reads both ends on one clock.
    const start = Date.now();
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"'),
      [],
      250,
      start,
      undefined,
      spanContext(traceId, sid(0), null),
    );

    new TraceSpanExporter(provider.getTracer("test")).export([root]);

    const span = exporter.getFinishedSpans()[0];
    const startedAtMs = span.startTime[0] * 1000 + span.startTime[1] / 1e6;
    const durationMs = span.duration[0] * 1000 + span.duration[1] / 1e6;
    expect(Math.round(startedAtMs)).toBe(start);
    expect(Math.round(durationMs)).toBe(250);
  });

  test("keeps trace-level attributes on the root even when a child carries its own identity", () => {
    // The child has a serviceName of its own; trace-level fields are still root-only, so the
    // child span must not repeat them.
    const child = traceNode(
      methodSignature("PaymentService", "charge", []),
      returned('"OK"'),
      [],
      50,
      1050,
      undefined,
      spanContext(traceId, sid(1), sid(0), { serviceName: "payments" }),
    );
    const root = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      returned('"done"'),
      [child],
      200,
      1000,
      undefined,
      spanContext(traceId, sid(0), null, { serviceName: "orders" }),
    );

    new TraceSpanExporter(provider.getTracer("test")).export([root]);

    const spans = exporter.getFinishedSpans();
    const rootSpan = spans.find((sp) => sp.name === "OrderService.placeOrder");
    const childSpan = spans.find((sp) => sp.name === "PaymentService.charge");
    expect(rootSpan?.attributes["nt.service.name"]).toBe("orders");
    expect(childSpan?.attributes["nt.service.name"]).toBeUndefined();
    // Identity attributes are per-span, so the child still carries those.
    expect(childSpan?.attributes["nt.trace_id"]).toBe(traceId);
  });

  test("exports a node with no span context, omitting identity and trace-level attributes", () => {
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 10, 0);

    new TraceSpanExporter(provider.getTracer("test")).export([root]);

    const span = exporter.getFinishedSpans()[0];
    expect(span.name).toBe("Svc.op");
    expect(span.attributes["narrative.duration_ms"]).toBe(10);
    expect(span.attributes["nt.trace_id"]).toBeUndefined();
    expect(span.attributes["nt.schemaVersion"]).toBeUndefined();
    expect(span.attributes["nt.service.name"]).toBeUndefined();
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded call-tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot() {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned('"ok"'),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as ReturnType<typeof traceNode>;
  }

  function deepChain(length: number) {
    let node = traceNode(methodSignature("Leaf", "op", []), returned('"ok"'), []);
    for (let i = 0; i < length; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [node]);
    }
    return node;
  }

  test("does not crash on a cyclic tree, and marks the cycle point truncated", () => {
    expect(() =>
      new TraceSpanExporter(provider.getTracer("test")).export([cyclicRoot()]),
    ).not.toThrow();
    const truncated = exporter
      .getFinishedSpans()
      .some((s) => s.attributes["narrative.truncated"] === "cycle");
    expect(truncated).toBe(true);
  });

  test("does not stack-overflow on a very deep chain", () => {
    expect(() =>
      new TraceSpanExporter(provider.getTracer("test")).export([deepChain(50_000)]),
    ).not.toThrow();
  });
});
