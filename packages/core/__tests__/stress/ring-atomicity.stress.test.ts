// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { BoundedEventBuffer } from "../../src/bounded-event-buffer.js";
import { BufferedEventConsumer } from "../../src/buffered-event-consumer.js";
import { methodSignature } from "../../src/method-signature.js";
import { spanContext } from "../../src/span-context.js";
import type { SpanId, TraceId } from "../../src/span-id-generator.js";
import type { TraceEvent } from "../../src/trace-event.js";
import { mulberry32, randomYield } from "./stress-helpers.js";
import { stressScale } from "./stress-scale.js";

// Generous, fixed regardless of mode — see fork-fanout-capture.stress.test.ts's identical
// comment: the gate-path run finishes in milliseconds, the long sweep's real macrotask scheduling
// can land close to vitest's 5s default under load.
const TEST_TIMEOUT_MS = 60_000;

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
 * Invariant 2 (no torn/partial reads) and invariant 3 (lazy allocation races allocate exactly
 * once), stress mirrors of Java jcstress UnsafePublicationTest/EventStoreSnapshotTest and
 * ClaimUniquenessTest. Both are N/A for the literal Java race (this ring has no claim-then-write
 * two-phase publish for another execution context to observe mid-way — see the fork/fan-out
 * capture commit's reasoning) but are pinned here with evidence rather than left as an assertion.
 */
describe("ring atomicity under high-volume bursts", () => {
  test("drain never yields a torn/undefined slot, and preserves exactly the events put", () => {
    const stress = stressScale(20260901);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 64 }),
        fc.integer({ min: 0, max: 200 }),
        (capacity, count) => {
          const buffer = new BoundedEventBuffer(capacity);
          const put: TraceEvent[] = [];
          for (let i = 0; i < count; i++) {
            const event = enter(i);
            put.push(event);
            buffer.put(event);
          }
          const drained: TraceEvent[] = [];
          buffer.drain((e) => drained.push(e));

          // Every drained slot is one of the events actually put — never undefined, never foreign
          // data — and the surviving window is exactly the tail of what was published, in order.
          const expectedTail = put.slice(Math.max(0, count - capacity));
          expect(drained.every((e) => e !== undefined && put.includes(e))).toBe(true);
          expect(drained).toEqual(expectedTail);
        },
      ),
      { numRuns: stress.scale(100), seed: stress.seed },
    );
  });

  test("the ring allocates exactly once regardless of how many events land before the first read", () => {
    const stress = stressScale(20260902);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 256 }),
        fc.integer({ min: 1, max: 500 }),
        (capacity, count) => {
          const buffer = new BoundedEventBuffer(capacity);
          expect(buffer.allocatedCapacity).toBe(0);
          const seen = new Set<number>();
          for (let i = 0; i < count; i++) {
            buffer.put(enter(i));
            seen.add(buffer.allocatedCapacity);
          }
          // Every allocatedCapacity ever observed after the first put is the same single value —
          // capacity — never 0 again and never re-sized.
          expect(seen.size).toBe(1);
          expect(seen.has(capacity)).toBe(true);
        },
      ),
      { numRuns: stress.scale(100), seed: stress.seed },
    );
  });
});

/**
 * Invariant 6 (flush()'s post-condition holds under concurrent publish: everything
 * published-before is in the store after), stress mirror of Java jcstress FlushRacingPublishTest.
 * flush() deliberately bypasses the adaptive shedding/emergency thresholds (drainAll has no chunk
 * limit and always stores), so a burst larger than the ring's capacity should lose exactly the
 * ring-overwritten tail — never a shedding-mode loss, since no timer tick ran.
 */
describe("flush()'s post-condition under a burst that exceeds the ring's capacity", () => {
  test("flush delivers everything the ring still holds; only true ring overwrite is lost", () => {
    const stress = stressScale(20260903);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 32 }),
        fc.integer({ min: 0, max: 5 }),
        (capacity, overBy) => {
          const consumer = new BufferedEventConsumer(capacity, 100_000, capacity);
          const published = capacity + overBy;
          for (let i = 0; i < published; i++) consumer.accept(enter(i));

          consumer.flush();

          expect(consumer.lastDrainMode).toBe("normal");
          expect(consumer.events().length + consumer.overflowCount()).toBe(published);
          expect(consumer.events().length).toBe(Math.min(published, capacity));
          consumer.close();
        },
      ),
      { numRuns: stress.scale(100), seed: stress.seed },
    );
  });

  /**
   * The same invariant under the heaviest interleaving this single-threaded runtime allows
   * (2026-09-08 concurrency-parity re-verification against the Java golden spec's
   * `synchronized flush()` — see that method's `@llmNote` and `BoundedEventBuffer.drain()`'s).
   * The sequential test above accepts everything, *then* flushes once; this one runs several
   * async "producer" tasks and a "flusher" task concurrently, interleaved via real microtask and
   * macrotask yields (`randomYield`), plus a subscriber whose `onEvent` is itself asynchronous —
   * the async seam most likely to reopen a claim/account window if one ever existed.
   *
   * The check is not "eventually everything lands" (a weaker, purely eventual-consistency
   * property) but the literal barrier: immediately before each `flush()` call — with zero yield
   * in between, so no producer can sneak an accept() into the gap — the test snapshots how many
   * `accept()` calls have already returned; immediately after `flush()` returns, delivered +
   * lost must equal that exact snapshot, not merely be at least that much. A future refactor that
   * inserts an `await` anywhere in the accept → drain → store chain (the thing both `@llmNote`s
   * above warn against) would surface here as `after < before`.
   */
  test(
    "flush() is a barrier under concurrent async producers, a concurrent flusher, and an async subscriber",
    async () => {
      const { seed, scale } = stressScale(20260904);
      const rand = mulberry32(seed);
      const capacity = 64;
      // A drain interval far longer than the test can run: the only drains in this test are the
      // explicit flush() calls under test, never a timer tick racing them too.
      const consumer = new BufferedEventConsumer(capacity, 100_000, capacity);
      consumer.subscribe({
        onEvent: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
      });

      let accepted = 0;
      const violations: string[] = [];

      async function producer(id: number, n: number): Promise<void> {
        for (let i = 0; i < n; i++) {
          await randomYield(rand);
          consumer.accept(enter(id * 1_000_000 + i));
          accepted++; // same synchronous turn as accept() — no yield between claim and count
        }
      }

      async function flusher(n: number): Promise<void> {
        for (let i = 0; i < n; i++) {
          await randomYield(rand);
          const before = accepted; // read, then flush(), with zero yield between the two
          consumer.flush();
          const after = consumer.events().length + consumer.overflowCount();
          if (after !== before) violations.push(`flush #${i}: before=${before} after=${after}`);
        }
      }

      const PRODUCERS = 6;
      await Promise.all([
        ...Array.from({ length: PRODUCERS }, (_, id) => producer(id, scale(40))),
        flusher(scale(30)),
      ]);

      expect(violations).toEqual([]);

      // Final drain: everything ever accepted is now accounted for, delivered or lost — nothing
      // left in the ring, nothing uncounted.
      consumer.flush();
      expect(consumer.events().length + consumer.overflowCount()).toBe(accepted);
      consumer.close();
    },
    TEST_TIMEOUT_MS,
  );
});
