// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { EventStoreConsumer } from "../src/event-store-consumer.js";
import { methodSignature } from "../src/method-signature.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import type { TraceEvent } from "../src/trace-event.js";
import { returned } from "../src/trace-outcome.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function sc(spanId: SpanId, parentSpanId: SpanId | null = null) {
  return spanContext(traceId, spanId, parentSpanId);
}

function enter(n: number, parentN: number | null = null): TraceEvent {
  return {
    type: "enter",
    spanContext: sc(sid(n), parentN !== null ? sid(parentN) : null),
    timestamp: 100 + n,
    signature: methodSignature("A", `method${n}`, []),
  };
}

function exit(n: number): TraceEvent {
  return {
    type: "exit",
    spanContext: sc(sid(n)),
    timestamp: 200 + n,
    outcome: returned(null),
  };
}

describe("EventStoreConsumer", () => {
  test("starts empty", () => {
    const store = new EventStoreConsumer();
    expect(store.events()).toEqual([]);
  });

  test("stores single accepted event", () => {
    const store = new EventStoreConsumer();
    const event = enter(0);
    store.accept(event);
    expect(store.events()).toEqual([event]);
  });

  test("clear removes all events", () => {
    const store = new EventStoreConsumer();
    store.accept(enter(0));
    store.accept(exit(0));
    store.clear();
    expect(store.events()).toEqual([]);
  });

  test("events does not accumulate across a clear boundary", () => {
    const store = new EventStoreConsumer();
    store.accept(enter(0));
    store.accept(exit(0));
    store.clear();
    store.accept(enter(1));
    store.accept(exit(1));

    expect(store.events()).toEqual([enter(1), exit(1)]);
  });
});
