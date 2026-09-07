// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  type EnterEvent,
  type ExitEvent,
  incomplete,
  methodSignature,
  returned,
  type SpanContext,
  threw,
} from "../../packages/core/src/index.js";
import { createLiveStreamConsumer } from "../demo-stream.js";

const span = (spanId: string, parentSpanId: string | null = null): SpanContext =>
  ({ traceId: "t", spanId, parentSpanId }) as unknown as SpanContext;

type Param = [name: string, renderedValue: string, redacted?: boolean];

const capture = ([name, renderedValue, redacted]: Param) => ({
  name,
  renderedValue,
  redacted: redacted ?? false,
});

function enter(
  spanId: string,
  className: string,
  methodName: string,
  params: Param[] = [],
): EnterEvent {
  const signature = methodSignature(className, methodName, params.map(capture));
  return { type: "enter", spanContext: span(spanId), timestamp: 0, signature };
}

function exit(spanId: string, outcome: ExitEvent["outcome"]): ExitEvent {
  return { type: "exit", spanContext: span(spanId), timestamp: 1, outcome };
}

function collect(): { lines: string[]; consume: ReturnType<typeof createLiveStreamConsumer> } {
  const lines: string[] = [];
  return { lines, consume: createLiveStreamConsumer((line) => lines.push(line)) };
}

describe("createLiveStreamConsumer", () => {
  test("an entry prints the call with named parameters, redacted ones as the marker", () => {
    const { lines, consume } = collect();
    consume(
      enter("1", "PaymentService", "charge", [
        ["customerId", '"C1"'],
        ["cardToken", "tok_C1", true],
      ]),
    );
    expect(lines).toStrictEqual([
      '→ PaymentService.charge(customerId: "C1", cardToken: [REDACTED])',
    ]);
  });

  test("a return names the call it closes and its value; void returns show no value", () => {
    const { lines, consume } = collect();
    consume(enter("1", "A", "b"));
    consume(exit("1", returned("42")));
    consume(enter("2", "A", "c"));
    consume(exit("2", returned(null)));
    consume(enter("3", "A", "d"));
    consume(exit("3", returned("undefined")));
    expect(lines).toStrictEqual(["→ A.b()", "← A.b → 42", "→ A.c()", "← A.c", "→ A.d()", "← A.d"]);
  });

  test("a throw prints type, message and the @onError narration, control characters escaped", () => {
    const { lines, consume } = collect();
    consume(enter("1", "CustomerService", "findCustomer", [["customerId", '"X"']]));
    consume(exit("1", threw(new Error("Customer not found: X[31m"), "Customer X not found")));
    consume(enter("2", "S", "m"));
    consume(exit("2", threw("boom")));
    expect(lines[1]).toBe(
      "!! CustomerService.findCustomer ✖ Error: Customer not found: X\\u001b[31m [Customer X not found]",
    );
    expect(lines[3]).toBe("!! S.m ✖ string: boom");
  });

  test("an entry with a control character in a value is escaped too", () => {
    const { lines, consume } = collect();
    consume(enter("1", "A", "b", [["name", '"line\nbreak"']]));
    expect(lines).toStrictEqual(['→ A.b(name: "line\\nbreak")']);
  });

  test("an incomplete exit and an exit for a span never entered are both reported, never thrown", () => {
    const { lines, consume } = collect();
    consume(enter("1", "A", "b"));
    consume(exit("1", incomplete()));
    consume(exit("ghost", returned("1")));
    expect(lines).toStrictEqual(["→ A.b()", "← A.b ⏳ (incomplete)", "← <unknown span> → 1"]);
  });

  test("fork and join events print the group markers", () => {
    const { lines, consume } = collect();
    consume({
      type: "fork-created",
      groupId: "g1",
      parentSpanId: "p",
      rootSpanId: "r",
      strategy: "fork-join",
      timestamp: 0,
    });
    consume({ type: "join-complete", groupId: "g1", memberCount: 2, wallTimeMs: 6, timestamp: 6 });
    consume({
      type: "fork-created",
      groupId: "g2",
      parentSpanId: "p",
      rootSpanId: "r",
      strategy: "fire-and-forget",
      timestamp: 0,
    });
    expect(lines).toStrictEqual([
      "⑂ fork group created [groupId: g1]",
      "⑃ fork joined [groupId: g1, members: 2, 6ms]",
      "⤳ fire-and-forget launched [groupId: g2]",
    ]);
  });

  test("a span's signature is forgotten after its exit, so a repeated span id starts fresh", () => {
    const { lines, consume } = collect();
    consume(enter("1", "A", "b"));
    consume(exit("1", returned("1")));
    consume(exit("1", returned("2")));
    expect(lines[2]).toBe("← <unknown span> → 2");
  });
});
