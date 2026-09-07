// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanId, TraceEvent, TraceId } from "@narrativetrace/core";
import { methodSignature, returned, spanContext, threw } from "@narrativetrace/core";
import { afterEach, describe, expect, test } from "vitest";
import { createEnricherEventConsumer } from "../src/enricher-event-consumer.js";
import { LogContext } from "../src/log-context.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function sc(spanId: SpanId, parentSpanId: SpanId | null = null) {
  return spanContext(traceId, spanId, parentSpanId);
}

afterEach(() => LogContext.reset());

function enterEvent(
  n: number,
  className: string,
  methodName: string,
  parentN: number | null = null,
): TraceEvent {
  return {
    type: "enter",
    spanContext: sc(sid(n), parentN !== null ? sid(parentN) : null),
    timestamp: 0,
    signature: methodSignature(className, methodName, []),
  };
}

describe("createEnricherEventConsumer", () => {
  test("enter event sets code.namespace and code.function", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "OrderService", "placeOrder"));

    expect(LogContext.get("code.namespace")).toBe("OrderService");
    expect(LogContext.get("code.function")).toBe("placeOrder");
  });

  // className/methodName come straight from MethodSignature, a public API that accepts any string
  // — control-escaped here so a hostile one cannot forge a log line in whatever sink reads this
  // MDC-equivalent (cross-runtime shape F6, 2026-09-02 audit).
  test("control-escapes a hostile className/methodName", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "A\nB", "c\nd"));

    expect(LogContext.get("code.namespace")).toBe("A\\nB");
    expect(LogContext.get("code.function")).toBe("c\\nd");
  });

  test("enter event sets nt.depth starting at 0", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "Svc", "op"));

    expect(LogContext.get("nt.depth")).toBe(0);
  });

  test("enter event sets trace_id and span_id", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "Svc", "op"));

    expect(LogContext.get("trace_id")).toBe(traceId);
    expect(LogContext.get("span_id")).toBe(sid(0));
  });

  test("enter sets service.* once when the span carries identity", () => {
    const consumer = createEnricherEventConsumer();

    consumer({
      type: "enter",
      spanContext: spanContext(traceId, sid(0), null, {
        serviceName: "orders",
        serviceVersion: "1.2.3",
        environment: "prod",
      }),
      timestamp: 0,
      signature: methodSignature("Svc", "op", []),
    });

    expect(LogContext.get("service.name")).toBe("orders");
    expect(LogContext.get("service.version")).toBe("1.2.3");
    expect(LogContext.get("service.environment")).toBe("prod");
  });

  test("service.* is set once and not overwritten by a child span with different identity", () => {
    const consumer = createEnricherEventConsumer();

    consumer({
      type: "enter",
      spanContext: spanContext(traceId, sid(0), null, { serviceName: "orders" }),
      timestamp: 0,
      signature: methodSignature("A", "a", []),
    });
    consumer({
      type: "enter",
      spanContext: spanContext(traceId, sid(1), sid(0), { serviceName: "payments" }),
      timestamp: 0,
      signature: methodSignature("B", "b", []),
    });

    expect(LogContext.get("service.name")).toBe("orders");
  });

  test("nested enter increments nt.depth", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "OrderService", "placeOrder"));
    consumer(enterEvent(1, "PaymentService", "charge", 0));

    expect(LogContext.get("nt.depth")).toBe(1);
    expect(LogContext.get("code.namespace")).toBe("PaymentService");
  });

  test("exit decrements depth and restores previous class/method", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "OrderService", "placeOrder"));
    consumer(enterEvent(1, "PaymentService", "charge", 0));
    consumer({
      type: "exit",
      spanContext: sc(sid(1), sid(0)),
      timestamp: 0,
      outcome: returned('"OK"'),
    });

    expect(LogContext.get("nt.depth")).toBe(0);
    expect(LogContext.get("code.namespace")).toBe("OrderService");
    expect(LogContext.get("code.function")).toBe("placeOrder");
  });

  test("exit with exception also restores context", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "OrderService", "placeOrder"));
    consumer(enterEvent(1, "PaymentService", "charge", 0));
    consumer({
      type: "exit",
      spanContext: sc(sid(1), sid(0)),
      timestamp: 0,
      outcome: threw(new Error("fail")),
    });

    expect(LogContext.get("nt.depth")).toBe(0);
    expect(LogContext.get("code.namespace")).toBe("OrderService");
  });

  test("exit of root-level call sets depth to 0 (not a -1 sentinel)", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "OrderService", "placeOrder"));
    consumer({ type: "exit", spanContext: sc(sid(0)), timestamp: 0, outcome: returned('"OK"') });

    expect(LogContext.get("nt.depth")).toBe(0);
  });

  test("exit after late attachment is safely ignored", () => {
    const consumer = createEnricherEventConsumer();

    consumer({ type: "exit", spanContext: sc(sid(99)), timestamp: 0, outcome: returned(null) });

    expect(LogContext.get("nt.depth")).toBeUndefined();
  });

  test("does not overwrite persistent trace_id from middleware", () => {
    const consumer = createEnricherEventConsumer();
    const middlewareTraceId = "11112222333344445555666677778888";
    LogContext.set("trace_id", middlewareTraceId);

    consumer(enterEvent(0, "Svc", "op"));

    expect(LogContext.get("trace_id")).toBe(middlewareTraceId);
  });

  test("sets trace_id from event when no middleware context exists", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "Svc", "op"));

    expect(LogContext.get("trace_id")).toBe(traceId);
  });

  test("span_id always set per-event even with persistent trace_id", () => {
    const consumer = createEnricherEventConsumer();
    LogContext.set("trace_id", "11112222333344445555666677778888");

    consumer(enterEvent(0, "Svc", "op"));

    expect(LogContext.get("span_id")).toBe(sid(0));
  });

  test("enter with unknown parentSpanId defaults depth to 0", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(5, "Svc", "op", 99));

    expect(LogContext.get("nt.depth")).toBe(0);
  });

  test("concurrent async contexts have isolated depth", async () => {
    const consumer = createEnricherEventConsumer();

    const [depth1, depth2] = await Promise.all([
      LogContext.run({}, async () => {
        consumer(enterEvent(10, "Svc", "a"));
        consumer(enterEvent(11, "Repo", "find", 10));
        await new Promise((r) => setTimeout(r, 5));
        return LogContext.get("nt.depth");
      }),
      LogContext.run({}, async () => {
        consumer(enterEvent(20, "Svc", "b"));
        await new Promise((r) => setTimeout(r, 5));
        return LogContext.get("nt.depth");
      }),
    ]);

    expect(depth1).toBe(1);
    expect(depth2).toBe(0);
  });

  test("enter event sets nt.entryType, nt.eventType, nt.schemaVersion", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "Svc", "op"));

    expect(LogContext.get("nt.entryType")).toBe("entry");
    expect(LogContext.get("nt.eventType")).toBe("method_enter");
    expect(LogContext.get("nt.schemaVersion")).toBe("1.0");
  });

  test("exit event sets nt.eventType to method_exit", () => {
    const consumer = createEnricherEventConsumer();

    consumer(enterEvent(0, "Svc", "op"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: 0,
      outcome: { kind: "returned", renderedValue: null },
    });

    expect(LogContext.get("nt.eventType")).toBe("method_exit");
  });
});
