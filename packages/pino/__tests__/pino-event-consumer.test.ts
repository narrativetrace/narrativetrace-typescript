// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanId, TraceEvent, TraceId } from "@narrativetrace/core";
import { incomplete, methodSignature, returned, spanContext, threw } from "@narrativetrace/core";
import pino from "pino";
import { describe, expect, test } from "vitest";
import { createPinoEventConsumer } from "../src/pino-event-consumer.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function sc(spanId: SpanId, parentSpanId: SpanId | null = null) {
  return spanContext(traceId, spanId, parentSpanId);
}

function createTestLogger() {
  const entries: Record<string, unknown>[] = [];
  const logger = pino(
    { level: "trace" },
    {
      write(chunk: string) {
        entries.push(JSON.parse(chunk));
      },
    },
  );
  return { logger, entries };
}

function enterEvent(n: number, className: string, methodName: string): TraceEvent {
  return {
    type: "enter",
    spanContext: sc(sid(n)),
    timestamp: 0,
    signature: methodSignature(className, methodName, []),
  };
}

describe("createPinoEventConsumer", () => {
  test("enter event logs class and method", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer(enterEvent(0, "OrderService", "placeOrder"));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.msg).toBe("→ OrderService.placeOrder");
    expect(entries[0]?.["code.namespace"]).toBe("OrderService");
    expect(entries[0]?.["code.function"]).toBe("placeOrder");
  });

  test("exit with return logs outcome and value", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: 1,
      outcome: returned('"OK"'),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.msg).toBe('← returned: "OK"');
    expect(entries[0]?.["nt.outcome"]).toBe("returned");
  });

  test("exit with exception logs the constructor name and warns by default", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: 1,
      outcome: threw(new TypeError("boom")),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.msg).toBe("!! TypeError: boom");
    expect(entries[0]?.["nt.outcome"]).toBe("threw");
    expect(entries[0]?.["exception.type"]).toBe("TypeError");
    expect(entries[0]?.["exception.message"]).toBe("boom");
    expect(entries[0]?.level).toBe(40); // pino warn level
  });

  test("exception with error context appends and sanitizes [context]", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: 1,
      outcome: threw(new Error("bad\nline"), "no such order 7\ninjected"),
    });

    expect(entries[0]?.msg).toBe("!! Error: bad\\nline [no such order 7\\ninjected]");
    expect(entries[0]?.["nt.errorContext"]).toBe("no such order 7\\ninjected");
  });

  test("enter event includes trace_id, spanId and parentSpanId", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "enter",
      spanContext: sc(sid(5), sid(3)),
      timestamp: 0,
      signature: methodSignature("Repo", "find", []),
    });

    expect(entries[0]?.["trace_id"]).toBe(traceId);
    expect(entries[0]?.["span_id"]).toBe(sid(5));
    expect(entries[0]?.["parent_span_id"]).toBe(sid(3));
  });

  test("carries service.* keys when the span has service identity", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

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

    expect(entries[0]?.["service.name"]).toBe("orders");
    expect(entries[0]?.["service.version"]).toBe("1.2.3");
    expect(entries[0]?.["service.environment"]).toBe("prod");
  });

  test("nt.depth increments on nested enter and decrements on exit", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer(enterEvent(0, "A", "a"));
    consumer({
      type: "enter",
      spanContext: sc(sid(1), sid(0)),
      timestamp: 0,
      signature: methodSignature("B", "b", []),
    });
    consumer({
      type: "exit",
      spanContext: sc(sid(1), sid(0)),
      timestamp: 1,
      outcome: returned("1"),
    });

    expect(entries[0]?.["nt.depth"]).toBe(0);
    expect(entries[1]?.["nt.depth"]).toBe(1);
    expect(entries[2]?.["nt.depth"]).toBe(0);
  });

  test("per-event levels are configurable", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger, {
      levels: { enter: "info", return: "info", exception: "error" },
    });

    consumer(enterEvent(0, "Svc", "op"));
    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: 1,
      outcome: threw(new Error("x")),
    });

    expect(entries[0]?.level).toBe(30); // info
    expect(entries[1]?.level).toBe(50); // error
  });

  test("exit with non-Error thrown value uses its typeof as the type", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: 1,
      outcome: threw("string-error"),
    });

    expect(entries[0]?.msg).toBe("!! string: string-error");
  });

  test("enter event includes formatted params", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);
    const params = [{ name: "orderId", renderedValue: '"order-42"', redacted: false }];

    consumer({
      type: "enter",
      spanContext: sc(sid(0)),
      timestamp: 0,
      signature: methodSignature("Svc", "op", params),
    });

    const logged = entries[0]?.["nt.parameters"] as { name: string; value: string }[];
    expect(logged).toHaveLength(1);
    expect(logged[0]?.name).toBe("orderId");
    expect(logged[0]?.value).toBe('"order-42"');
  });

  test("enter event includes nt.entryType, nt.eventType, nt.schemaVersion", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer(enterEvent(0, "Svc", "op"));

    expect(entries[0]?.["nt.entryType"]).toBe("entry");
    expect(entries[0]?.["nt.eventType"]).toBe("method_enter");
    expect(entries[0]?.["nt.schemaVersion"]).toBe("1.0");
  });

  test("exit event includes nt.entryType, nt.eventType, nt.schemaVersion", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "exit",
      spanContext: sc(sid(0)),
      timestamp: 1,
      outcome: returned('"OK"'),
    });

    expect(entries[0]?.["nt.entryType"]).toBe("entry");
    expect(entries[0]?.["nt.eventType"]).toBe("method_exit");
    expect(entries[0]?.["nt.schemaVersion"]).toBe("1.0");
  });

  test("enter event includes storyId and chapterId from span context", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "enter",
      spanContext: spanContext(traceId, sid(0), null, undefined, {
        storyId: "OrderService.placeOrder",
        chapterId: "OrderService.placeOrder",
      }),
      timestamp: 0,
      signature: methodSignature("OrderService", "placeOrder", []),
    });

    expect(entries[0]?.["nt.storyId"]).toBe("OrderService.placeOrder");
    expect(entries[0]?.["nt.chapterId"]).toBe("OrderService.placeOrder");
  });

  test("exit with incomplete outcome logs a warning", () => {
    const { logger, entries } = createTestLogger();
    const consumer = createPinoEventConsumer(logger);

    consumer({
      type: "exit",
      spanContext: sc(sid(1)),
      timestamp: 1,
      outcome: incomplete(),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.msg).toBe("← incomplete");
    expect(entries[0]?.["nt.outcome"]).toBe("incomplete");
    expect(entries[0]?.["nt.eventType"]).toBe("method_exit");
  });
});
