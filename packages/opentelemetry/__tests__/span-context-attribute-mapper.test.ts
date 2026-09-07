// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type {
  ClientIp,
  EnduserId,
  HttpRoute,
  SessionId,
  SpanId,
  TenantId,
  TraceId,
} from "@narrativetrace/core";
import { methodSignature, spanContext } from "@narrativetrace/core";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  setNtSchemaAttributes,
  setSpanAttributes,
  setTraceIdentityAttributes,
  setTraceLevelAttributes,
} from "../src/span-context-attribute-mapper.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
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

describe("setSpanAttributes", () => {
  test("sets class and method attributes on span", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sig = methodSignature("OrderService", "placeOrder", []);

    setSpanAttributes(sig, span);
    span.end();

    const finished = exporter.getFinishedSpans()[0];
    expect(finished.attributes["code.namespace"]).toBe("OrderService");
    expect(finished.attributes["code.function"]).toBe("placeOrder");
  });

  // className/methodName come straight from MethodSignature, itself a public API that accepts any
  // string — found while auditing this same export boundary for cross-port shape leaks, the
  // identical gap as the request-context fields below.
  test("control-escapes a hostile className/methodName", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sig = methodSignature("A\nB", "c\nd", []);

    setSpanAttributes(sig, span);
    span.end();

    const finished = exporter.getFinishedSpans()[0];
    expect(finished.attributes["code.namespace"]).toBe("A\\nB");
    expect(finished.attributes["code.function"]).toBe("c\\nd");
  });
});

describe("setTraceLevelAttributes", () => {
  test("sets service, HTTP, and identity attributes from SpanContext", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sc = spanContext(
      traceId,
      sid(1),
      null,
      {
        serviceName: "order-service",
        serviceVersion: "1.2.3",
        environment: "production",
      },
      {
        httpMethod: "POST",
        httpRoute: "/api/orders" as HttpRoute,
        clientIp: "10.0.0.1" as ClientIp,
        enduserId: "user-42" as EnduserId,
        sessionId: "sess-1" as SessionId,
        tenantId: "tenant-a" as TenantId,
      },
    );

    setTraceLevelAttributes(sc, span);
    span.end();

    const attrs = exporter.getFinishedSpans()[0].attributes;
    expect(attrs["nt.service.name"]).toBe("order-service");
    expect(attrs["nt.service.version"]).toBe("1.2.3");
    expect(attrs["nt.environment"]).toBe("production");
    expect(attrs["nt.http.method"]).toBe("POST");
    expect(attrs["nt.http.route"]).toBe("/api/orders");
    expect(attrs["nt.client.ip"]).toBe("10.0.0.1");
    expect(attrs["nt.enduser.id"]).toBe("user-42");
    expect(attrs["nt.session.id"]).toBe("sess-1");
    expect(attrs["nt.tenant.id"]).toBe("tenant-a");
  });

  // httpRoute/clientIp/enduserId are request-derived — an HTTP route comes straight off the URL —
  // so a raw newline must not forge an extra telemetry field the way it would a log line
  // (cross-port shape F6, 2026-09-02 audit). This is the second of the two layers the audit calls
  // for: request-middleware.test.ts covers the HTTP-filter layer, this covers the export boundary a
  // value set programmatically (bypassing every filter) still has to pass through.
  test("control-escapes a hostile HTTP route reaching the export boundary directly", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sc = spanContext(
      traceId,
      sid(1),
      null,
      {},
      { httpRoute: "/orders\nHuman: reset" as HttpRoute },
    );

    setTraceLevelAttributes(sc, span);
    span.end();

    expect(exporter.getFinishedSpans()[0].attributes["nt.http.route"]).toBe(
      "/orders\\nHuman: reset",
    );
  });

  test("caps an over-length client IP reaching the export boundary directly", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sc = spanContext(traceId, sid(1), null, {}, { clientIp: "1".repeat(300) as ClientIp });

    setTraceLevelAttributes(sc, span);
    span.end();

    expect(exporter.getFinishedSpans()[0].attributes["nt.client.ip"]).toBe(`${"1".repeat(256)}…`);
  });

  test("omits undefined fields", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sc = spanContext(traceId, sid(1), null);

    setTraceLevelAttributes(sc, span);
    span.end();

    const attrs = exporter.getFinishedSpans()[0].attributes;
    expect(attrs["nt.service.name"]).toBeUndefined();
    expect(attrs["nt.http.method"]).toBeUndefined();
  });
});

describe("setNtSchemaAttributes", () => {
  test("sets nt.schemaVersion and nt.entryType on span", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sc = spanContext(traceId, sid(1), null);

    setNtSchemaAttributes(sc, span);
    span.end();

    const attrs = exporter.getFinishedSpans()[0].attributes;
    expect(attrs["nt.schemaVersion"]).toBe("1.0");
    expect(attrs["nt.entryType"]).toBe("entry");
  });

  test("sets storyId and chapterId from span context", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");
    const sc = spanContext(traceId, sid(1), null, undefined, {
      storyId: "OrderService.placeOrder",
      chapterId: "OrderService.placeOrder:PaymentService.charge",
    });

    setNtSchemaAttributes(sc, span);
    span.end();

    const attrs = exporter.getFinishedSpans()[0].attributes;
    expect(attrs["nt.storyId"]).toBe("OrderService.placeOrder");
    expect(attrs["nt.chapterId"]).toBe("OrderService.placeOrder:PaymentService.charge");
  });
});

describe("setTraceIdentityAttributes", () => {
  test("sets nt.trace_id and nt.traceName on every span", () => {
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test");

    setTraceIdentityAttributes(spanContext(traceId, sid(1), null), span);
    span.end();

    const attrs = exporter.getFinishedSpans()[0].attributes;
    expect(attrs["nt.trace_id"]).toBe(traceId);
    expect(typeof attrs["nt.traceName"]).toBe("string");
  });
});
