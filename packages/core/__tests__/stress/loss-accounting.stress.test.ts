// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BoundedEventBuffer } from "../../src/bounded-event-buffer.js";
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
    timestamp: 100 + n,
    signature: methodSignature("A", `method${n}`, []),
  };
}

describe("loss accounting is exact under high-volume bursts (stress mirror of Java jcstress LossAccountingTest / SaturatedRingAccountingTest)", () => {
  test("ring-level: delivered + overwritten == published, at any burst size around the capacity boundary", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 128 }),
        fc.integer({ min: -2, max: 10 }),
        (capacity, offset) => {
          const burstSize = Math.max(0, capacity + offset);
          const buffer = new BoundedEventBuffer(capacity);
          for (let i = 0; i < burstSize; i++) buffer.put(enter(i));
          const delivered: TraceEvent[] = [];
          buffer.drain((e) => delivered.push(e));
          expect(delivered.length + buffer.overflowCount).toBe(burstSize);
        },
      ),
    );
  });

  describe("consumer-level (drain-mode shedding/emergency)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("a burst heavy enough to trigger shedding still accounts for every published event", () => {
      // capacity 100, chunk 10: an 80-event burst fills to 80% (shedding). The timer drains it to
      // empty over several ticks, shedding the first chunk and storing the rest once fill drops to
      // the normal band. Every one of the 80 published events must end up either delivered or
      // counted as shed — never simply gone.
      const consumer = new BufferedEventConsumer(100, 100, 10);
      const published = 80;
      for (let i = 0; i < published; i++) consumer.accept(enter(i));

      for (
        let tick = 0;
        tick < 20 && consumer.events().length + consumer.overflowCount() < published;
        tick++
      ) {
        vi.advanceTimersByTime(100);
      }

      const delivered = consumer.events().length;
      const shed = consumer.overflowCount();
      expect(delivered + shed).toBe(published);
      consumer.close();
    });
  });
});
