// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
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

describe("BufferedEventConsumer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("flush drains every buffered event, not just one chunk", () => {
    // chunkSize 4, 10 events buffered: a single chunked drain would leave 6 behind.
    const consumer = new BufferedEventConsumer(100, 100_000, 4);
    for (let i = 0; i < 10; i++) consumer.accept(enter(i));

    consumer.flush();

    expect(consumer.events()).toHaveLength(10);
    consumer.close();
  });

  test("flush stores events even when the buffer is past the shedding threshold", () => {
    // 80/100 = 80% fill. A drain CYCLE sheds here; an explicit flush must not lose data.
    const consumer = new BufferedEventConsumer(100, 100_000, 10);
    for (let i = 0; i < 80; i++) consumer.accept(enter(i));

    consumer.flush();

    expect(consumer.events()).toHaveLength(80);
    consumer.close();
  });

  test("flush stores events even when the buffer is past the emergency threshold", () => {
    const consumer = new BufferedEventConsumer(100, 100_000, 10);
    for (let i = 0; i < 95; i++) consumer.accept(enter(i));

    consumer.flush();

    expect(consumer.events()).toHaveLength(95);
    consumer.close();
  });

  test("flush is not a drain cycle, so it leaves the reported drain mode alone", () => {
    const consumer = new BufferedEventConsumer(100, 100_000, 10);
    for (let i = 0; i < 95; i++) consumer.accept(enter(i));

    consumer.flush();

    expect(consumer.lastDrainMode).toBe("normal");
    consumer.close();
  });

  test("flush notifies subscribers for every drained event beyond the first chunk", () => {
    const received: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(100, 100_000, 2);
    consumer.subscribe({ onEvent: (e) => void received.push(e) });
    for (let i = 0; i < 7; i++) consumer.accept(enter(i));

    consumer.flush();

    expect(received).toHaveLength(7);
    consumer.close();
  });

  test("close drains buffered events so shutdown does not silently lose the tail", () => {
    const consumer = new BufferedEventConsumer(100, 100_000, 10);
    for (let i = 0; i < 25; i++) consumer.accept(enter(i));

    consumer.close();

    expect(consumer.events()).toHaveLength(25);
  });

  test("a second close neither re-drains nor duplicates stored events", () => {
    const consumer = new BufferedEventConsumer(100, 100_000, 10);
    consumer.accept(enter(0));

    consumer.close();
    consumer.close();

    expect(consumer.events()).toHaveLength(1);
  });

  test("a second close does not drain events accepted after the first", () => {
    const consumer = new BufferedEventConsumer(100, 100, 10);
    consumer.close();
    consumer.accept(enter(0));

    consumer.close();

    // Closed means closed: a post-close accept stays buffered and unobservable, exactly as it does
    // when no second close ever happens.
    expect(consumer.events()).toEqual([]);
  });

  test("whenCountReached resolves once N events are drained", async () => {
    vi.useRealTimers();
    const consumer = new BufferedEventConsumer(64);
    const reached = consumer.whenCountReached(2);
    consumer.accept(enter(0));
    consumer.accept(enter(1));
    consumer.flush();
    await expect(reached).resolves.toBeUndefined();
    consumer.close();
  });

  test("whenCountReached stays pending until the count is actually reached", async () => {
    vi.useRealTimers();
    const consumer = new BufferedEventConsumer(64);
    let resolved = false;
    void consumer.whenCountReached(2).then(() => {
      resolved = true;
    });

    consumer.accept(enter(0));
    consumer.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(false);

    consumer.accept(enter(1));
    consumer.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(true);
    consumer.close();
  });

  test("whenClosed stays pending while the consumer is open", async () => {
    vi.useRealTimers();
    const consumer = new BufferedEventConsumer(64);
    let resolved = false;
    void consumer.whenClosed().then(() => {
      resolved = true;
    });

    consumer.accept(enter(0));
    consumer.flush();
    await new Promise((r) => setTimeout(r, 0));

    expect(resolved).toBe(false);
    consumer.close();
  });

  test("whenCountReached resolves immediately when already met", async () => {
    vi.useRealTimers();
    const consumer = new BufferedEventConsumer(64);
    consumer.accept(enter(0));
    consumer.flush();
    await expect(consumer.whenCountReached(1)).resolves.toBeUndefined();
    consumer.close();
  });

  test("whenClosed resolves on close and close is idempotent", async () => {
    vi.useRealTimers();
    const consumer = new BufferedEventConsumer(64);
    const closed = consumer.whenClosed();
    consumer.close();
    consumer.close();
    await expect(closed).resolves.toBeUndefined();
  });

  test("whenClosed resolves immediately for an already-closed consumer", async () => {
    vi.useRealTimers();
    const consumer = new BufferedEventConsumer(64);
    consumer.close();
    await expect(consumer.whenClosed()).resolves.toBeUndefined();
  });

  test("close releases a count waiter whose count will never be reached", async () => {
    vi.useRealTimers();
    const consumer = new BufferedEventConsumer(64);
    const reached = consumer.whenCountReached(99);
    consumer.accept(enter(0));

    consumer.close();

    // One event drained, 99 asked for: the waiter is released rather than left hanging forever.
    await expect(reached).resolves.toBeUndefined();
    expect(consumer.events()).toHaveLength(1);
  });

  test("unrefs the drain timer so it does not pin the event loop", () => {
    const unref = vi.fn();
    const spy = vi.spyOn(globalThis, "setInterval").mockReturnValue({ unref } as never);
    try {
      const consumer = new BufferedEventConsumer(8);
      consumer.accept(enter(0));
      expect(unref).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("buffers events where the timer handle has no unref, as in a browser", () => {
    // Browsers hand back an opaque handle (a number) with no unref: the guard must hold, or every
    // traced call in the browser throws on the first buffered event.
    const setSpy = vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as never);
    const clearSpy = vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});
    try {
      const consumer = new BufferedEventConsumer(8);
      expect(() => consumer.accept(enter(0))).not.toThrow();
      consumer.flush();
      expect(consumer.events()).toEqual([enter(0)]);
      consumer.close();
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });

  test("registers no drain timer until an event is buffered", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    expect(vi.getTimerCount()).toBe(0);
    consumer.close();
  });

  test("allocates no buffer slots until an event is buffered", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    expect(consumer.allocatedCapacity).toBe(0);
    consumer.close();
  });

  test("starts the drain timer when the first event is buffered", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    expect(vi.getTimerCount()).toBe(1);
    consumer.close();
  });

  test("buffering more events does not register a second drain timer", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    consumer.accept(enter(1));
    consumer.accept(enter(2));
    expect(vi.getTimerCount()).toBe(1);
    consumer.close();
  });

  test("stops the drain timer once the buffer drains empty", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    vi.advanceTimersByTime(50);
    expect(consumer.events()).toEqual([enter(0)]);
    expect(vi.getTimerCount()).toBe(0);
    consumer.close();
  });

  test("keeps the drain timer running while the buffer still holds events", () => {
    const consumer = new BufferedEventConsumer(100, 50, 10);
    for (let i = 0; i < 50; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(50);
    expect(vi.getTimerCount()).toBe(1);
    consumer.close();
  });

  test("never clears the drain timer while events are still waiting", () => {
    // The rule, tick by tick: 50 events at 10 per tick need five ticks, and the timer must survive
    // every one of the first four. Stopping early on a non-empty buffer would strand the rest.
    const consumer = new BufferedEventConsumer(100, 50, 10);
    for (let i = 0; i < 50; i++) consumer.accept(enter(i));

    for (let tick = 1; tick <= 4; tick++) {
      vi.advanceTimersByTime(50);
      expect(vi.getTimerCount()).toBe(1);
      expect(consumer.events()).toHaveLength(tick * 10);
    }

    consumer.close();
  });

  test("drains the whole tail when nothing new arrives, then stops", () => {
    // The tail case a drain mechanism exists for: events are buffered, the producer goes quiet,
    // and no further accept ever re-arms anything. Every one of them must still reach the store.
    const consumer = new BufferedEventConsumer(100, 50, 10);
    for (let i = 0; i < 50; i++) consumer.accept(enter(i));

    vi.advanceTimersByTime(50 * 5);

    expect(consumer.events()).toHaveLength(50);
    expect(vi.getTimerCount()).toBe(0);
    consumer.close();
  });

  test("restarts the drain timer for an event accepted after the buffer drained", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    vi.advanceTimersByTime(50);
    consumer.accept(enter(1));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(50);
    expect(consumer.events()).toEqual([enter(0), enter(1)]);
    consumer.close();
  });

  test("flush stops the drain timer it emptied", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    consumer.flush();
    expect(vi.getTimerCount()).toBe(0);
    consumer.close();
  });

  test("clear stops the drain timer", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    consumer.clear();
    expect(vi.getTimerCount()).toBe(0);
    consumer.close();
  });

  test("close stops the drain timer", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    consumer.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("an event accepted after close does not start a drain timer", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.close();
    consumer.accept(enter(0));
    expect(vi.getTimerCount()).toBe(0);
  });

  test("consumers left unclosed and dropped retain neither a timer nor an allocation", () => {
    // The leak class this default is sized against: a per-request or per-test context nobody
    // closes. A rooted interval would keep every one of these alive.
    for (let i = 0; i < 1000; i++) {
      const consumer = new BufferedEventConsumer();
      expect(consumer.allocatedCapacity).toBe(0);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  test("an unclosed consumer's drain timer does not hold the Node event loop open", (ctx) => {
    vi.useRealTimers();
    const probe = setInterval(() => {}, 60_000);
    const observable = typeof (probe as { hasRef?: unknown }).hasRef === "function";
    clearInterval(probe);
    // Browsers/edge runtimes hand back an opaque handle with neither unref nor hasRef; there the
    // self-stopping timer is the whole guarantee and there is nothing to assert.
    if (!observable) return ctx.skip();

    const spy = vi.spyOn(globalThis, "setInterval");
    try {
      const consumer = new BufferedEventConsumer(8, 60_000);
      consumer.accept(enter(0));
      const timer = spy.mock.results[0]?.value as { hasRef(): boolean };
      expect(timer.hasRef()).toBe(false);
      consumer.close();
    } finally {
      spy.mockRestore();
    }
  });

  test("accept puts events into buffer, not visible until flush", () => {
    const consumer = new BufferedEventConsumer(8);
    consumer.accept(enter(0));
    expect(consumer.events()).toEqual([]);
    consumer.flush();
    expect(consumer.events()).toEqual([enter(0)]);
    consumer.close();
  });

  test("events returns stored events in insertion order", () => {
    const consumer = new BufferedEventConsumer(10);
    for (let i = 0; i < 5; i++) consumer.accept(enter(i));
    consumer.flush();
    expect(consumer.events()).toEqual([enter(0), enter(1), enter(2), enter(3), enter(4)]);
    consumer.close();
  });

  test("default capacity is 65536", () => {
    const consumer = new BufferedEventConsumer();
    expect(consumer.capacity).toBe(65536);
    consumer.close();
  });

  test("the first event allocates the whole default ring, all 65536 slots", () => {
    const consumer = new BufferedEventConsumer();
    consumer.accept(enter(0));
    expect(consumer.allocatedCapacity).toBe(65536);
    consumer.close();
  });

  test("the ring is exactly the configured capacity from the first event", () => {
    const consumer = new BufferedEventConsumer(1024, 100_000, 16);
    consumer.accept(enter(0));
    expect(consumer.allocatedCapacity).toBe(1024);
    consumer.close();
  });

  test("the ring never reallocates as events pile up past its capacity", () => {
    const consumer = new BufferedEventConsumer(32, 100_000, 16);
    for (let i = 0; i < 5; i++) consumer.accept(enter(i));
    expect(consumer.allocatedCapacity).toBe(32);
    for (let i = 5; i < 100; i++) consumer.accept(enter(i));
    expect(consumer.allocatedCapacity).toBe(32);
    consumer.close();
  });

  test("sheds the oldest events at the cap and counts the loss", () => {
    const consumer = new BufferedEventConsumer(4, 100_000, 16);
    for (let i = 0; i < 6; i++) consumer.accept(enter(i));

    expect(consumer.allocatedCapacity).toBe(4);
    expect(consumer.overflowCount()).toBe(2);
    consumer.flush();
    expect(consumer.events()).toEqual([enter(2), enter(3), enter(4), enter(5)]);
    consumer.close();
  });

  test("shedding at the cap is not counted as subscriber backpressure", () => {
    const consumer = new BufferedEventConsumer(4, 100_000, 16);
    consumer.subscribe({ onEvent: () => {} });
    for (let i = 0; i < 6; i++) consumer.accept(enter(i));
    consumer.flush();
    expect(consumer.overflowCount()).toBe(2);
    expect(consumer.droppedCount()).toBe(0);
    consumer.close();
  });

  test("filling the ring right up to its capacity is not counted as loss", () => {
    const consumer = new BufferedEventConsumer(64, 100_000, 16);
    for (let i = 0; i < 64; i++) consumer.accept(enter(i));
    expect(consumer.overflowCount()).toBe(0);
    consumer.close();
  });

  test("default chunk size is 1024", () => {
    const consumer = new BufferedEventConsumer();
    expect(consumer.chunkSize).toBe(1024);
    consumer.close();
  });

  test("drain cycle fires automatically on interval", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.accept(enter(0));
    expect(consumer.events()).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(consumer.events()).toEqual([enter(0)]);
    consumer.close();
  });

  test("close clears the drain timer", () => {
    const consumer = new BufferedEventConsumer(10, 50);
    consumer.close();
    // Anything accepted after close stays put: no timer is left running to drain it.
    consumer.accept(enter(0));
    vi.advanceTimersByTime(500);
    expect(consumer.events()).toEqual([]);
  });

  test("timer drains one chunk not the entire buffer", () => {
    const consumer = new BufferedEventConsumer(100, 50, 10);
    for (let i = 0; i < 50; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(50);
    expect(consumer.events()).toHaveLength(10);
    consumer.close();
  });

  test("multiple timer ticks drain buffer incrementally", () => {
    const consumer = new BufferedEventConsumer(100, 50, 10);
    for (let i = 0; i < 50; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(150); // 3 ticks × 10 = 30
    expect(consumer.events()).toHaveLength(30);
    consumer.close();
  });

  test("clear resets buffer and store", () => {
    // capacity=100, chunkSize=10, fill 10 = 10% → normal (events are stored)
    const consumer = new BufferedEventConsumer(100, 100, 10);
    for (let i = 0; i < 10; i++) consumer.accept(enter(i));
    consumer.flush();
    expect(consumer.events()).toHaveLength(10);
    consumer.clear();
    expect(consumer.events()).toEqual([]);
    // buffer also cleared — an undrained event does not survive the clear
    consumer.accept(enter(50));
    consumer.clear();
    consumer.flush();
    expect(consumer.events()).toEqual([]);
    consumer.close();
  });

  test("shedding mode does not add events to store", () => {
    const consumer = new BufferedEventConsumer(100, 100, 10);
    for (let i = 0; i < 80; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(100); // one drain CYCLE — shedding applies here, not to flush()
    expect(consumer.lastDrainMode).toBe("shedding");
    expect(consumer.events()).toHaveLength(0);
    consumer.close();
  });

  test("emergency mode discards chunk", () => {
    // capacity=100, chunkSize=10, fill 95 = 95% → emergency
    const consumer = new BufferedEventConsumer(100, 100, 10);
    for (let i = 0; i < 95; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(100); // one drain CYCLE — emergency applies here, not to flush()
    expect(consumer.lastDrainMode).toBe("emergency");
    expect(consumer.events()).toEqual([]);
    consumer.close();
  });

  test("transitions from shedding to normal as buffer drains", () => {
    // capacity=100, chunkSize=30, fill 75 = 75% → shedding
    const consumer = new BufferedEventConsumer(100, 50, 30);
    for (let i = 0; i < 75; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(50);
    expect(consumer.lastDrainMode).toBe("shedding");
    // 75 - 30 = 45 remain → 45% → normal
    vi.advanceTimersByTime(50);
    expect(consumer.lastDrainMode).toBe("normal");
    expect(consumer.events()).toHaveLength(30);
    consumer.close();
  });

  test("transitions from emergency to normal as buffer drains", () => {
    // capacity=100, chunkSize=40, fill 95 = 95% → emergency
    const consumer = new BufferedEventConsumer(100, 50, 40);
    for (let i = 0; i < 95; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(50);
    expect(consumer.lastDrainMode).toBe("emergency");
    // 95 - 40 = 55 remain → 55% → normal
    vi.advanceTimersByTime(50);
    expect(consumer.lastDrainMode).toBe("normal");
    consumer.close();
  });

  test("exactly 70% fill is normal mode", () => {
    // Must be a drain CYCLE: flush() never sets the mode, so flushing here would assert nothing
    // about the threshold. At exactly 70% the chunk is stored, not shed.
    const consumer = new BufferedEventConsumer(100, 100, 10);
    for (let i = 0; i < 70; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(100);
    expect(consumer.lastDrainMode).toBe("normal");
    expect(consumer.events()).toHaveLength(10);
    consumer.close();
  });

  test("exactly 90% fill is shedding not emergency", () => {
    const consumer = new BufferedEventConsumer(100, 100, 10);
    for (let i = 0; i < 90; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(100);
    expect(consumer.lastDrainMode).toBe("shedding");
    consumer.close();
  });

  test("subscriber receives events after normal drain", () => {
    const received: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
      },
    });
    consumer.accept(enter(0));
    consumer.flush();
    expect(received).toEqual([enter(0)]);
    consumer.close();
  });

  test("multiple subscribers each receive every event", () => {
    const a: TraceEvent[] = [];
    const b: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        a.push(e);
      },
    });
    consumer.subscribe({
      onEvent: (e) => {
        b.push(e);
      },
    });
    consumer.accept(enter(0));
    consumer.accept(enter(1));
    consumer.flush();
    expect(a).toEqual([enter(0), enter(1)]);
    expect(b).toEqual([enter(0), enter(1)]);
    consumer.close();
  });

  test("a synchronously-throwing subscriber does not break the drain", () => {
    const other: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: () => {
        throw new Error("subscriber boom");
      },
    });
    consumer.subscribe({
      onEvent: (e) => {
        other.push(e);
      },
    });
    consumer.accept(enter(0));
    expect(() => consumer.flush()).not.toThrow();
    // store still received it, other subscriber still received it, no drop counted
    expect(consumer.events()).toEqual([enter(0)]);
    expect(other).toEqual([enter(0)]);
    expect(consumer.droppedCount()).toBe(0);
    consumer.close();
  });

  // Bug-hunt no-poison contract: a best-effort listener that throws must be disabled
  // after the failure, not offered every subsequent event forever (Java: ListenerFanoutConsumer
  // disables a listener that fails once). Non-Error throws (a string, a plain object) must be
  // caught exactly the same way — JS's `catch` is total by construction, unlike Java's
  // Exception-only boundary, so this is the one behavior actually missing here.
  test("a subscriber is disabled after it throws, and a non-Error throw disables it too", () => {
    const consumer = new BufferedEventConsumer(10);
    let calls = 0;
    consumer.subscribe({
      onEvent: () => {
        calls++;
        throw "not an Error instance";
      },
    });

    consumer.accept(enter(0));
    consumer.flush();
    consumer.accept(enter(1));
    consumer.flush();

    expect(calls).toBe(1);
    consumer.close();
  });

  // Deliberately not disabled: an async subscriber's rejection only clears its busy flag (see
  // "async subscriber rejection marks slot as not-busy" above) — only a *synchronous* throw
  // disables the slot, matching Java's finding, which is scoped to synchronous listener calls.
  test("an async subscriber whose promise rejects keeps receiving events", async () => {
    const consumer = new BufferedEventConsumer(10);
    let calls = 0;
    consumer.subscribe({
      onEvent: async () => {
        calls++;
        throw new Error("async subscriber boom");
      },
    });

    consumer.accept(enter(0));
    consumer.flush();
    await Promise.resolve();
    await Promise.resolve();
    consumer.accept(enter(1));
    consumer.flush();

    expect(calls).toBe(2);
    consumer.close();
  });

  test("subscriber not called during shedding", () => {
    const received: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(100, 100, 10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
      },
    });
    for (let i = 0; i < 80; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(100);
    expect(consumer.lastDrainMode).toBe("shedding");
    expect(received).toEqual([]);
    consumer.close();
  });

  test("subscriber not called during emergency", () => {
    const received: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(100, 100, 10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
      },
    });
    for (let i = 0; i < 95; i++) consumer.accept(enter(i));
    vi.advanceTimersByTime(100);
    expect(consumer.lastDrainMode).toBe("emergency");
    expect(received).toEqual([]);
    consumer.close();
  });

  test("subscriber receives events via flush", () => {
    const received: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
      },
    });
    consumer.accept(enter(0));
    consumer.flush();
    expect(received).toEqual([enter(0)]);
    consumer.close();
  });

  test("async subscriber receives events when not busy", async () => {
    const received: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
        return Promise.resolve();
      },
    });
    consumer.accept(enter(0));
    consumer.flush();
    expect(received).toEqual([enter(0)]);
    consumer.close();
  });

  test("async subscriber drops events when previous delivery pending", () => {
    const received: TraceEvent[] = [];
    let resolve: () => void;
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
        return new Promise<void>((r) => {
          resolve = r;
        });
      },
    });
    consumer.accept(enter(0));
    consumer.accept(enter(1));
    consumer.flush(); // delivers enter(0), promise pending
    consumer.flush(); // enter(1) should be dropped — subscriber busy
    expect(received).toEqual([enter(0)]);
    expect(consumer.droppedCount()).toBe(1);
    resolve?.();
    consumer.close();
  });

  test("async subscriber resumes after pending delivery resolves", async () => {
    const received: TraceEvent[] = [];
    let resolve: () => void;
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
        return new Promise<void>((r) => {
          resolve = r;
        });
      },
    });
    consumer.accept(enter(0));
    consumer.flush(); // delivers enter(0), pending
    resolve?.();
    await Promise.resolve(); // let microtask clear busy flag
    consumer.accept(enter(1));
    consumer.flush(); // should deliver enter(1)
    expect(received).toEqual([enter(0), enter(1)]);
    expect(consumer.droppedCount()).toBe(0);
    resolve?.();
    consumer.close();
  });

  test("async subscriber drop increments droppedCount", () => {
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: () => new Promise<void>(() => {}), // never resolves
    });
    consumer.accept(enter(0));
    consumer.flush(); // delivers, now busy
    consumer.accept(enter(1));
    consumer.flush(); // dropped
    consumer.accept(enter(2));
    consumer.flush(); // dropped
    expect(consumer.droppedCount()).toBe(2);
    consumer.close();
  });

  test("droppedCount returns total across all subscribers", () => {
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: () => new Promise<void>(() => {}), // never resolves
    });
    consumer.subscribe({
      onEvent: () => new Promise<void>(() => {}), // never resolves
    });
    consumer.accept(enter(0));
    consumer.flush(); // both deliver, both busy
    consumer.accept(enter(1));
    consumer.flush(); // both drop
    expect(consumer.droppedCount()).toBe(2);
    consumer.close();
  });

  test("mixed sync and async subscribers work independently", () => {
    const syncReceived: TraceEvent[] = [];
    const asyncReceived: TraceEvent[] = [];
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        syncReceived.push(e);
      },
    });
    consumer.subscribe({
      onEvent: (e) => {
        asyncReceived.push(e);
        return new Promise<void>(() => {}); // never resolves
      },
    });
    consumer.accept(enter(0));
    consumer.flush();
    consumer.accept(enter(1));
    consumer.flush();
    // sync got both, async got only first (busy for second)
    expect(syncReceived).toEqual([enter(0), enter(1)]);
    expect(asyncReceived).toEqual([enter(0)]);
    expect(consumer.droppedCount()).toBe(1);
    consumer.close();
  });

  test("async subscriber rejection marks slot as not-busy", async () => {
    const received: TraceEvent[] = [];
    let reject: (err: Error) => void;
    const consumer = new BufferedEventConsumer(10);
    consumer.subscribe({
      onEvent: (e) => {
        received.push(e);
        return new Promise<void>((_, r) => {
          reject = r;
        });
      },
    });
    consumer.accept(enter(0));
    consumer.flush(); // delivers, pending
    reject?.(new Error("fail"));
    await Promise.resolve(); // let microtask clear busy flag
    consumer.accept(enter(1));
    consumer.flush(); // should deliver — slot recovered
    expect(received).toEqual([enter(0), enter(1)]);
    consumer.close();
  });
});
