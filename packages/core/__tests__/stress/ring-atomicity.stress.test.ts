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
import { stressScale } from "./stress-scale.js";

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
});
