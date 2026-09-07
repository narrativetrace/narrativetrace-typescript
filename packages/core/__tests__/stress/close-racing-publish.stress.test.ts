// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
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

describe("close() racing publish (stress mirror of Java jcstress CloseRacingPublishTest)", () => {
  test("a subscriber that publishes reentrantly while close() is draining is not silently lost", () => {
    // A single-threaded analogue of a producer publishing while close() runs: nothing preempts
    // JS mid-statement, so the only way a publish can land *during* close()'s terminal drain is
    // reentrancy — a subscriber whose onEvent synchronously traces more work on a context sharing
    // this consumer (e.g. an instrumented listener). That publish must still be counted: either
    // delivered, or shed and tallied — never silently stranded in a ring nothing will drain again.
    const consumer = new BufferedEventConsumer(100, 100_000, 4);
    consumer.subscribe({
      onEvent: (event) => {
        if (event.type === "enter" && event.spanContext.spanId === sid(0)) {
          consumer.accept(enter(1));
        }
      },
    });
    consumer.accept(enter(0));

    consumer.close();

    const delivered = consumer.events().length;
    const shed = consumer.overflowCount();
    expect(delivered + shed).toBe(2);
  });
});
