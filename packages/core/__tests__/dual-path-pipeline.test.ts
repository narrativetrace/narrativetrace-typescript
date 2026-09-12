// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test, vi } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { DualPathPipeline, ensureStoreBacked } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";
import { methodSignature } from "../src/method-signature.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import type { TraceEvent } from "../src/trace-event.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function sc(spanId: SpanId, parentSpanId: SpanId | null = null) {
  return spanContext(traceId, spanId, parentSpanId);
}

function enter(n: number): TraceEvent {
  return {
    type: "enter",
    spanContext: sc(sid(n)),
    timestamp: 100 + n,
    signature: methodSignature("A", `method${n}`, []),
  };
}

describe("DualPathPipeline", () => {
  test("publish calls sync consumer inline", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), null);
    pipeline.publish(enter(0));
    expect(received).toEqual([enter(0)]);
    pipeline.close();
  });

  test("publish calls bestEffort.accept", () => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(null, bestEffort);
    pipeline.publish(enter(0));
    bestEffort.flush();
    expect(bestEffort.events()).toEqual([enter(0)]);
    pipeline.close();
  });

  test("flush delegates to bestEffort.flush", () => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(null, bestEffort);
    pipeline.publish(enter(0));
    pipeline.flush();
    expect(pipeline.events()).toEqual([enter(0)]);
    pipeline.close();
  });

  test("events delegates to bestEffort.events", () => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(null, bestEffort);
    pipeline.publish(enter(0));
    pipeline.flush();
    expect(pipeline.events()).toEqual([enter(0)]);
    pipeline.close();
  });

  test("clear delegates to bestEffort.clear", () => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(null, bestEffort);
    pipeline.publish(enter(0));
    pipeline.flush();
    pipeline.clear();
    expect(pipeline.events()).toEqual([]);
    pipeline.close();
  });

  test("close delegates to bestEffort.close", () => {
    vi.useFakeTimers();
    const bestEffort = new BufferedEventConsumer(10, 50);
    const pipeline = new DualPathPipeline(null, bestEffort);
    pipeline.publish(enter(0));

    pipeline.close();

    // Delegation is visible twice over: close() drained the buffered tail into the store...
    expect(pipeline.events()).toEqual([enter(0)]);
    // ...and cleared the timer, so nothing published afterwards is ever drained.
    pipeline.publish(enter(1));
    vi.advanceTimersByTime(500);
    expect(pipeline.events()).toEqual([enter(0)]);
    vi.useRealTimers();
  });

  // A null bestEffort must never silently empty captureTrace(): every real call site in this
  // repository always supplies a BufferedEventConsumer, and every documented snippet that once
  // passed `null` here did so by mistake, not by design — so `null` now defaults to a working
  // BufferedEventConsumer instead of disabling capture.
  test("null bestEffort consumer defaults to a working buffer, not silent capture loss", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), null);
    pipeline.publish(enter(0));
    expect(received).toEqual([enter(0)]);
    pipeline.flush();
    expect(pipeline.events()).toEqual([enter(0)]);
    pipeline.clear();
    expect(pipeline.events()).toEqual([]);
    pipeline.close();
  });

  test("works with null sync consumer", () => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(null, bestEffort);
    pipeline.publish(enter(0));
    pipeline.flush();
    expect(pipeline.events()).toEqual([enter(0)]);
    pipeline.close();
  });

  test("a throwing sync listener does not propagate; best-effort still receives", () => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(() => {
      throw new Error("listener boom");
    }, bestEffort);
    expect(() => pipeline.publish(enter(0))).not.toThrow();
    bestEffort.flush();
    expect(bestEffort.events()).toEqual([enter(0)]);
    pipeline.close();
  });

  test("a throwing best-effort accept does not propagate; sync listener still receives", () => {
    const received: TraceEvent[] = [];
    const throwingBestEffort = {
      accept() {
        throw new Error("accept boom");
      },
    } as unknown as BufferedEventConsumer;
    const pipeline = new DualPathPipeline((e) => received.push(e), throwingBestEffort);
    expect(() => pipeline.publish(enter(0))).not.toThrow();
    expect(received).toEqual([enter(0)]);
  });

  // Bug-hunt no-poison contract: Java's DualPathPipeline.publish caught only
  // Exception, so an AssertionError (or any other non-Exception Throwable) from a listener
  // escaped onto the application thread. JS's `catch` has no such split — it is total over
  // anything thrown, Error subclass or not — so this pins that the port never had Java's gap,
  // rather than leaving it merely assumed.
  test.each([
    ["an AssertionError-equivalent", () => new Error("assertion failed")],
    ["a non-Error string throw", () => "boom"],
    ["a plain object throw", () => ({ code: "LINKAGE_ERROR" })],
    ["undefined", () => undefined],
  ])("publish survives a sync listener throwing %s", (_label, makeThrown) => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(() => {
      throw makeThrown();
    }, bestEffort);

    expect(() => pipeline.publish(enter(0))).not.toThrow();
    bestEffort.flush();
    expect(bestEffort.events()).toEqual([enter(0)]);
    pipeline.close();
  });

  test("sync consumer receives all events regardless of drain mode", () => {
    vi.useFakeTimers();
    const received: TraceEvent[] = [];
    const bestEffort = new BufferedEventConsumer(10);
    const pipeline = new DualPathPipeline((e) => received.push(e), bestEffort);
    for (let i = 0; i < 10; i++) pipeline.publish(enter(i));
    expect(received).toHaveLength(10);
    // 10/10 = 100% → a drain CYCLE runs in emergency mode and discards from the store.
    vi.advanceTimersByTime(100);
    expect(bestEffort.lastDrainMode).toBe("emergency");
    expect(pipeline.events()).toEqual([]);
    // but the sync consumer got everything, whatever the buffered path decided to shed
    expect(received).toHaveLength(10);
    pipeline.close();
    vi.useRealTimers();
  });
});

describe("ensureStoreBacked", () => {
  test("returns DualPathPipeline unchanged", () => {
    const bestEffort = new BufferedEventConsumer(8);
    const pipeline = new DualPathPipeline(null, bestEffort);
    expect(ensureStoreBacked(pipeline)).toBe(pipeline);
    pipeline.close();
  });

  test("wraps non-DualPathPipeline and forwards to original", () => {
    const received: TraceEvent[] = [];
    const custom: EventPipeline = {
      publish: (e) => received.push(e),
      flush: () => {},
      events: () => [],
      clear: () => {},
      close: () => {},
    };
    const wrapped = ensureStoreBacked(custom);
    wrapped.publish(enter(0));
    expect(received).toEqual([enter(0)]);
    wrapped.flush();
    expect(wrapped.events()).toEqual([enter(0)]);
    (wrapped as DualPathPipeline).close();
  });
});
