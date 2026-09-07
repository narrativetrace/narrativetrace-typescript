// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BufferedEventConsumer } from "../../src/buffered-event-consumer.js";
import { methodSignature } from "../../src/method-signature.js";
import { spanContext } from "../../src/span-context.js";
import type { SpanId, TraceId } from "../../src/span-id-generator.js";
import type { TraceEvent } from "../../src/trace-event.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function enter(n: number): TraceEvent {
  return {
    type: "enter",
    spanContext: spanContext(traceId, sid(n)),
    timestamp: n,
    signature: methodSignature("A", `method${n}`, []),
  };
}

/**
 * Invariant 4 (the tail is never stranded), stress mirror of Java jcstress
 * DrainRacingPublishTest/ConsumerParkWakeupTest — the timer/park-wakeup race, translated to this
 * port's single-threaded model as reentrancy: a subscriber's `onEvent`, invoked synchronously
 * from inside a timer tick's drain, publishes a new event at the exact instant the buffer would
 * otherwise reach empty and `stopDrainingIfEmpty` would park the timer. This is the ordinary
 * (non-close) counterpart to the close()-racing-publish fix: here nothing is terminal, so the
 * self-stopping-timer contract alone must be enough to catch the straggler on a later tick.
 */
describe("a publish landing exactly at the drain-to-empty instant is never stranded", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("reentrant publish during the tick that would empty the buffer keeps the timer armed", () => {
    const consumer = new BufferedEventConsumer(100, 100, 1);
    consumer.subscribe({
      onEvent: (event) => {
        if (event.type === "enter" && event.spanContext.spanId === sid(0)) {
          consumer.accept(enter(1));
        }
      },
    });
    consumer.accept(enter(0));

    // One tick: drains event 0 (chunk size 1), whose delivery reentrantly publishes event 1. The
    // buffer is not empty afterwards, so the timer must still be armed — never parked over a
    // straggler.
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(1);
    expect(consumer.events()).toHaveLength(1);

    // A second tick drains the reentrant event and only then, correctly, parks the timer.
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(0);
    expect(consumer.events()).toHaveLength(2);

    consumer.close();
  });
});
