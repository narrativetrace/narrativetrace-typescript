// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { SCHEMA_VERSION, toCanonicalEntry, UNKNOWN_SERVICE } from "../src/canonical-entry.js";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import type { EnterEvent, ExitEvent } from "../src/trace-event.js";
import { incomplete, returned, threw } from "../src/trace-outcome.js";

const traceId = "abcdef1234567890abcdef1234567890" as TraceId;
const spanId = "00f067aa0ba902b7" as SpanId;

describe("SCHEMA_VERSION", () => {
  // Pinned as a literal on purpose: `entry.schema.json` and `chapter.schema.json` both declare
  // this value as a `const`, so asserting against the constant itself would assert nothing.
  test("is the version the canonical schemas pin", () => {
    expect(SCHEMA_VERSION).toBe("1.2");
  });
});

describe("toCanonicalEntry", () => {
  test("maps enter event to canonical entry with required fields", () => {
    const event: EnterEvent = {
      type: "enter",
      spanContext: spanContext(traceId, spanId, null, undefined, {
        storyId: "OrderService.placeOrder",
        chapterId: "OrderService.placeOrder",
      }),
      timestamp: 123.456,
      signature: methodSignature("OrderService", "placeOrder", [
        parameterCapture("orderId", '"42"', false),
      ]),
    };

    const entry = toCanonicalEntry(event);

    expect(entry["nt.entryType"]).toBe("entry");
    expect(entry["nt.eventType"]).toBe("method_enter");
    expect(entry["nt.schemaVersion"]).toBe("1.2");
    expect(entry["code.namespace"]).toBe("OrderService");
    expect(entry["code.function"]).toBe("placeOrder");
    expect(entry.trace_id).toBe(traceId);
    expect(entry.span_id).toBe(spanId);
    expect(entry.parent_span_id).toBeNull();
    expect(entry.level).toBe("trace");
    expect(entry.message).toBe("→ OrderService.placeOrder");
    expect(entry["nt.storyId"]).toBe("OrderService.placeOrder");
    expect(entry["nt.chapterId"]).toBe("OrderService.placeOrder");
    expect(entry["nt.traceName"]).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
    expect(entry["nt.parameters"]).toEqual([{ name: "orderId", value: '"42"' }]);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("maps exit event with returned outcome", () => {
    const event: ExitEvent = {
      type: "exit",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 200.0,
      outcome: returned('"ok"'),
    };

    const entry = toCanonicalEntry(event);

    expect(entry["nt.eventType"]).toBe("method_exit");
    expect(entry.level).toBe("trace");
    expect(entry.message).toBe('← returned: "ok"');
    expect(entry["nt.outcome"]).toBe("success");
    expect(entry["nt.returnValue"]).toBe('"ok"');
    expect(entry.span_id).toBe(spanId);
    expect(entry["code.namespace"]).toBe("");
    expect(entry["code.function"]).toBe("");
  });

  test("maps exit event with threw outcome", () => {
    const event: ExitEvent = {
      type: "exit",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 300.0,
      outcome: threw(new Error("connection refused")),
    };

    const entry = toCanonicalEntry(event);

    expect(entry["nt.eventType"]).toBe("method_exit");
    expect(entry.level).toBe("error");
    expect(entry.message).toBe("!! Error: connection refused");
    expect(entry["nt.outcome"]).toBe("failure");
    expect(entry["exception.message"]).toBe("connection refused");
    expect(entry["exception.type"]).toBe("Error");
  });

  test("includes service and environment from span context", () => {
    const event: EnterEvent = {
      type: "enter",
      spanContext: spanContext(traceId, spanId, null, {
        serviceName: "order-service",
        environment: "production",
      }),
      timestamp: 100.0,
      signature: methodSignature("Svc", "op", []),
    };

    const entry = toCanonicalEntry(event);

    expect(entry.service).toBe("order-service");
    expect(entry.environment).toBe("production");
  });

  test("omits optional fields when not present", () => {
    const event: EnterEvent = {
      type: "enter",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 100.0,
      signature: methodSignature("Svc", "op", []),
    };

    const entry = toCanonicalEntry(event);

    expect("nt.storyId" in entry).toBe(false);
    expect("nt.chapterId" in entry).toBe(false);
    expect("nt.parameters" in entry).toBe(false);
    expect("environment" in entry).toBe(false);
    // service is schema-required, so it carries the fallback rather than being absent.
    expect(entry.service).toBe("unknown_service:node");
  });

  test("service falls back to unknown_service:node when the host pins no name", () => {
    const event: EnterEvent = {
      type: "enter",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 100.0,
      signature: methodSignature("Svc", "op", []),
    };

    expect(toCanonicalEntry(event).service).toBe(UNKNOWN_SERVICE);
  });

  test("service falls back when the host pins a blank name", () => {
    const event: EnterEvent = {
      type: "enter",
      spanContext: { ...spanContext(traceId, spanId, null), serviceName: "   " },
      timestamp: 100.0,
      signature: methodSignature("Svc", "op", []),
    };

    expect(toCanonicalEntry(event).service).toBe("unknown_service:node");
  });

  test("service is never the literal string null", () => {
    const event: EnterEvent = {
      type: "enter",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 100.0,
      signature: methodSignature("Svc", "op", []),
    };

    expect(toCanonicalEntry(event).service).not.toBe("null");
  });

  test("non-Error thrown value uses string representation", () => {
    const event: ExitEvent = {
      type: "exit",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 100.0,
      outcome: threw("string error"),
    };

    const entry = toCanonicalEntry(event);

    expect(entry["exception.message"]).toBe("string error");
    expect(entry["exception.type"]).toBe("string");
  });

  test("a void completion carries no return value at all", () => {
    const event: ExitEvent = {
      type: "exit",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 100.0,
      outcome: returned(null),
    };

    const entry = toCanonicalEntry(event);

    // "returned nothing" and "returned the value null" are different claims; the key is absent
    // rather than null so a consumer can still tell them apart.
    expect(entry.message).toBe("← returned");
    expect("nt.returnValue" in entry).toBe(false);
    expect(entry["nt.outcome"]).toBe("success");
  });

  test("enter with parent span id", () => {
    const parentId = "b9c7c989f97918e1" as SpanId;
    const event: EnterEvent = {
      type: "enter",
      spanContext: spanContext(traceId, spanId, parentId),
      timestamp: 100.0,
      signature: methodSignature("Svc", "op", []),
    };

    const entry = toCanonicalEntry(event);

    expect(entry.parent_span_id).toBe(parentId);
  });

  test("enter with redacted parameter omits redacted flag", () => {
    const event: EnterEvent = {
      type: "enter",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 100.0,
      signature: methodSignature("Svc", "op", [parameterCapture("secret", "***", true)]),
    };

    const entry = toCanonicalEntry(event);

    expect(entry["nt.parameters"]).toEqual([{ name: "secret", value: "***" }]);
  });

  test("maps fork-created event", () => {
    const entry = toCanonicalEntry({
      type: "fork-created",
      groupId: "group-1",
      parentSpanId: spanId,
      rootSpanId: "aabbccddeeff0011" as SpanId,
      strategy: "fork-join",
      timestamp: 100.0,
    });

    expect(entry["nt.eventType"]).toBe("fork");
    expect(entry["nt.entryType"]).toBe("entry");
    expect(entry["nt.schemaVersion"]).toBe("1.2");
    expect(entry.level).toBe("trace");
    expect(entry.message).toContain("fork-join");
    expect(entry.message).toContain("group-1");
    expect(entry.span_id).toBe("aabbccddeeff0011");
    expect(entry.parent_span_id).toBe(spanId);
    expect(entry.trace_id).toBe("");
    expect(entry["code.namespace"]).toBe("");
    expect(entry["code.function"]).toBe("");
    expect(entry["nt.traceName"]).toBe("");
  });

  test("maps join-complete event", () => {
    const entry = toCanonicalEntry({
      type: "join-complete",
      groupId: "group-1",
      memberCount: 3,
      wallTimeMs: 42.5,
      timestamp: 100.0,
    });

    expect(entry["nt.eventType"]).toBe("join");
    expect(entry["nt.entryType"]).toBe("entry");
    expect(entry["nt.schemaVersion"]).toBe("1.2");
    expect(entry.level).toBe("trace");
    expect(entry.message).toContain("3 members");
    expect(entry.message).toContain("42.5ms");
    expect(entry.span_id).toBe("");
    expect(entry.parent_span_id).toBeNull();
    expect(entry.trace_id).toBe("");
    expect(entry["nt.traceName"]).toBe("");
    expect(entry["code.namespace"]).toBe("");
    expect(entry["code.function"]).toBe("");
  });

  test("maps exit event with incomplete outcome", () => {
    const event: ExitEvent = {
      type: "exit",
      spanContext: spanContext(traceId, spanId, null),
      timestamp: 100.0,
      outcome: incomplete(),
    };

    const entry = toCanonicalEntry(event);

    expect(entry["nt.eventType"]).toBe("method_exit");
    expect(entry.level).toBe("trace");
    expect(entry.message).toBe("← incomplete");
    expect(entry["nt.outcome"]).toBe("incomplete");
    expect(entry["nt.returnValue"]).toBeUndefined();
    expect(entry["exception.message"]).toBeUndefined();
  });
});
