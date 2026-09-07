// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "../src/branded-types.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736" as TraceId;
const spanId = "00f067aa0ba902b7" as SpanId;
const parentSpanId = "b9c7c989f97918e1" as SpanId;

describe("spanContext", () => {
  test("creates context with required fields", () => {
    const ctx = spanContext(traceId, spanId, null);
    expect(ctx.traceId).toBe(traceId);
    expect(ctx.spanId).toBe(spanId);
    expect(ctx.parentSpanId).toBeNull();
  });

  test("creates context with parent span id", () => {
    const ctx = spanContext(traceId, spanId, parentSpanId);
    expect(ctx.parentSpanId).toBe(parentSpanId);
  });

  test("freezes the returned object", () => {
    const ctx = spanContext(traceId, spanId, null);
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  test("includes service identity when provided", () => {
    const ctx = spanContext(traceId, spanId, null, {
      serviceName: "order-service",
      serviceVersion: "2.3.1",
      environment: "production",
    });
    expect(ctx.serviceName).toBe("order-service");
    expect(ctx.serviceVersion).toBe("2.3.1");
    expect(ctx.environment).toBe("production");
  });

  test("omits service fields when not provided", () => {
    const ctx = spanContext(traceId, spanId, null);
    expect("serviceName" in ctx).toBe(false);
    expect("serviceVersion" in ctx).toBe(false);
    expect("environment" in ctx).toBe(false);
  });

  test("omits individual service fields that are undefined", () => {
    const ctx = spanContext(traceId, spanId, null, {
      serviceName: "svc",
    });
    expect(ctx.serviceName).toBe("svc");
    expect("serviceVersion" in ctx).toBe(false);
    expect("environment" in ctx).toBe(false);
  });

  test("includes W3C trace flags and state when provided", () => {
    const ctx = spanContext(traceId, spanId, null, undefined, {
      traceFlags: 1,
      traceState: "congo=t61rcWkgMzE",
    });
    expect(ctx.traceFlags).toBe(1);
    expect(ctx.traceState).toBe("congo=t61rcWkgMzE");
  });

  test("includes HTTP context when provided", () => {
    const ctx = spanContext(traceId, spanId, null, undefined, {
      httpMethod: "POST",
      httpRoute: "/api/orders" as HttpRoute,
    });
    expect(ctx.httpMethod).toBe("POST");
    expect(ctx.httpRoute).toBe("/api/orders");
  });

  test("includes user and tenant context when provided", () => {
    const ctx = spanContext(traceId, spanId, null, undefined, {
      clientIp: "10.0.0.1" as ClientIp,
      enduserId: "user-42" as EnduserId,
      sessionId: "sess-abc" as SessionId,
      tenantId: "tenant-1" as TenantId,
    });
    expect(ctx.clientIp).toBe("10.0.0.1");
    expect(ctx.enduserId).toBe("user-42");
    expect(ctx.sessionId).toBe("sess-abc");
    expect(ctx.tenantId).toBe("tenant-1");
  });

  test("includes span name when provided", () => {
    const ctx = spanContext(traceId, spanId, null, undefined, {
      spanName: "handleOrder",
    });
    expect(ctx.spanName).toBe("handleOrder");
  });

  test("omits all extras fields when not provided", () => {
    const ctx = spanContext(traceId, spanId, null);
    for (const key of [
      "traceFlags",
      "traceState",
      "httpMethod",
      "httpRoute",
      "clientIp",
      "enduserId",
      "sessionId",
      "tenantId",
      "spanName",
      "storyId",
      "chapterId",
    ]) {
      expect(key in ctx).toBe(false);
    }
  });

  test("includes storyId and chapterId when provided", () => {
    const ctx = spanContext(traceId, spanId, null, undefined, {
      storyId: "OrderService.placeOrder",
      chapterId: "OrderService.placeOrder:PaymentService.charge",
    });
    expect(ctx.storyId).toBe("OrderService.placeOrder");
    expect(ctx.chapterId).toBe("OrderService.placeOrder:PaymentService.charge");
  });
});
