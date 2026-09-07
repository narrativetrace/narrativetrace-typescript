// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  methodSignature,
  type SpanId,
  spanContext,
  type TraceId,
} from "@narrativetrace/core";
import { describe, expect, test, vi } from "vitest";
import { registerAutoFlush } from "../src/lifecycle.js";

function fakeProc() {
  const handlers = new Map<string, () => void>();
  return {
    once: (event: string, handler: () => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
    emit: (event: string) => handlers.get(event)?.(),
    has: (event: string) => handlers.has(event),
  };
}

describe("registerAutoFlush", () => {
  test("flushes then closes on a shutdown signal", () => {
    const target = { flush: vi.fn(), close: vi.fn() };
    const proc = fakeProc();
    registerAutoFlush(target, proc);

    proc.emit("beforeExit");

    expect(target.flush).toHaveBeenCalledTimes(1);
    expect(target.close).toHaveBeenCalledTimes(1);
    expect(target.flush.mock.invocationCallOrder[0]).toBeLessThan(
      target.close.mock.invocationCallOrder[0]!,
    );
  });

  test("runs at most once across multiple signals", () => {
    const target = { flush: vi.fn(), close: vi.fn() };
    const proc = fakeProc();
    registerAutoFlush(target, proc);

    proc.emit("beforeExit");
    proc.emit("SIGTERM");

    expect(target.close).toHaveBeenCalledTimes(1);
  });

  test("the disposer removes the listeners", () => {
    const target = { flush: vi.fn(), close: vi.fn() };
    const proc = fakeProc();
    const dispose = registerAutoFlush(target, proc);

    dispose();
    proc.emit("beforeExit");

    expect(target.close).not.toHaveBeenCalled();
    expect(proc.has("beforeExit")).toBe(false);
  });
});

describe("registerAutoFlush — shutdown drains the real consumer", () => {
  test("preserves a tail larger than one drain chunk on SIGTERM", () => {
    // The promise in registerAutoFlush's contract: "buffered-but-undrained tail events are not
    // lost". A chunk-limited flush silently dropped everything past the chunk size.
    const consumer = new BufferedEventConsumer(4096, 100_000, 1024);
    for (let i = 0; i < 3000; i++) {
      consumer.accept({
        type: "enter",
        spanContext: spanContext(
          "0".repeat(32) as TraceId,
          i.toString(16).padStart(16, "0") as SpanId,
          null,
        ),
        timestamp: i,
        signature: methodSignature("Svc", "op", []),
      });
    }
    const proc = fakeProc();
    registerAutoFlush(consumer, proc);

    proc.emit("SIGTERM");

    expect(consumer.events()).toHaveLength(3000);
  });

  test("preserves the tail even when the buffer is past the shedding threshold", () => {
    // Shutdown is not the moment to shed detail: the run is over, nothing is relieved by dropping.
    const consumer = new BufferedEventConsumer(100, 100_000, 10);
    for (let i = 0; i < 85; i++) {
      consumer.accept({
        type: "enter",
        spanContext: spanContext(
          "0".repeat(32) as TraceId,
          i.toString(16).padStart(16, "0") as SpanId,
          null,
        ),
        timestamp: i,
        signature: methodSignature("Svc", "op", []),
      });
    }
    const proc = fakeProc();
    registerAutoFlush(consumer, proc);

    proc.emit("SIGTERM");

    expect(consumer.events()).toHaveLength(85);
  });
});
