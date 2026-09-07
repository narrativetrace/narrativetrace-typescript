// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";
import type { SpanId } from "../src/span-id-generator.js";
import { anyTraceLoss, NO_TRACE_LOSS, traceLoss } from "../src/trace-loss.js";

describe("TraceLoss", () => {
  test("nothing lost is nothing to report", () => {
    expect(anyTraceLoss(NO_TRACE_LOSS)).toBe(false);
    expect(NO_TRACE_LOSS).toEqual({
      droppedEvents: 0,
      refusedScopes: 0,
      refusedSpans: 0,
      discardedSpans: 0,
    });
  });

  test("discardedSpans defaults to 0 for callers that don't pass it", () => {
    expect(traceLoss(1, 2, 3)).toEqual({
      droppedEvents: 1,
      refusedScopes: 2,
      refusedSpans: 3,
      discardedSpans: 0,
    });
  });

  test("a discarded span is counted but is not, on its own, a loss", () => {
    // Discarding happens after the request that owned the work ended — no narrative anyone
    // renders is missing anything it could have contained (mirrors Java's TraceLoss.any()).
    expect(anyTraceLoss(traceLoss(0, 0, 0, 7))).toBe(false);
  });

  test("a negative discardedSpans count is rejected", () => {
    expect(() => traceLoss(0, 0, 0, -1)).toThrow(RangeError);
  });

  test("a shed event is a loss", () => {
    expect(anyTraceLoss(traceLoss(1, 0, 0))).toBe(true);
  });

  test("a refused scope is a loss", () => {
    expect(anyTraceLoss(traceLoss(0, 1, 12))).toBe(true);
  });

  test("spans without a refused scope are not a loss on their own", () => {
    // A refusal always counts a scope; a span count with no scope behind it is a bookkeeping
    // error, not a hole in the narrative.
    expect(anyTraceLoss(traceLoss(0, 0, 12))).toBe(false);
  });

  test.each([
    ["dropped events", [-1, 0, 0]],
    ["refused scopes", [0, -1, 0]],
    ["refused spans", [0, 0, -1]],
  ])("a negative count for %s is rejected", (_label, [dropped, scopes, spans]) => {
    expect(() => traceLoss(dropped as number, scopes as number, spans as number)).toThrow(
      RangeError,
    );
  });

  test("a reading is frozen", () => {
    const loss = traceLoss(1, 2, 3);
    expect(Object.isFrozen(loss)).toBe(true);
  });
});

describe("context trace loss", () => {
  function contextWith(pipeline: EventPipeline, maxAdoptedSpans = 10_000): SyncNarrativeContext {
    return new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      null,
      undefined,
      undefined,
      maxAdoptedSpans,
    );
  }

  test("a clean run reports no loss", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const context = contextWith(pipeline);
    context.exitMethodWithReturn('"ok"', context.enterMethod("Svc", "op", []));

    expect(context.traceLoss()).toEqual(NO_TRACE_LOSS);

    pipeline.close();
  });

  test("a refused hand-over is counted in the loss", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const context = contextWith(pipeline, 1);

    context.adopt(new Set(["a" as SpanId, "b" as SpanId]));

    expect(context.traceLoss()).toEqual({
      droppedEvents: 0,
      refusedScopes: 1,
      refusedSpans: 2,
      discardedSpans: 0,
    });
    expect(anyTraceLoss(context.traceLoss())).toBe(true);

    pipeline.close();
  });

  // no-poison contract: a refused batch is nobody's to report — its events must not linger in
  // the shared pipeline forever, and the refusal is not double-counted as a discard too.
  test("a refused hand-over's events are removed from the pipeline, not just uncounted", () => {
    const buffer = new BufferedEventConsumer(64);
    const pipeline = new DualPathPipeline(null, buffer);
    const context = contextWith(pipeline, 1);
    const worker = contextWith(pipeline);
    worker.exitMethodWithReturn('"a"', worker.enterMethod("Worker", "taskA", []));
    worker.exitMethodWithReturn('"b"', worker.enterMethod("Worker", "taskB", []));

    context.adopt(worker.reportableSpanIds());

    pipeline.flush();
    expect(pipeline.events()).toHaveLength(0);
    expect(context.traceLoss().discardedSpans).toBe(0);

    pipeline.close();
  });

  test("events the buffer shed are counted in the loss", () => {
    const buffer = new BufferedEventConsumer(2);
    const pipeline = new DualPathPipeline(null, buffer);
    const context = contextWith(pipeline);
    for (let i = 0; i < 8; i++) context.enterMethod("Svc", `op${i}`, []);

    expect(context.traceLoss().droppedEvents).toBe(buffer.overflowCount());
    expect(context.traceLoss().droppedEvents).toBeGreaterThan(0);

    pipeline.close();
  });

  // Bug-hunt no-poison contract: Java's exact deterministic repro shape — publish 64
  // events into a 16-slot ring, expect 16 retained and 48 dropped — carried end-to-end through
  // the context, not only the ring's own overflow counter, so retained-vs-reported can never
  // disagree (delivered + counted-dropped == published).
  test("publishing 64 events into a 16-slot ring retains 16 and reports 48 dropped", () => {
    const buffer = new BufferedEventConsumer(16);
    const pipeline = new DualPathPipeline(null, buffer);
    const context = contextWith(pipeline);

    for (let i = 0; i < 32; i++) {
      context.exitMethodWithReturn('"ok"', context.enterMethod("Svc", `op${i}`, []));
    }
    pipeline.flush();

    expect(pipeline.events()).toHaveLength(16);
    expect(context.traceLoss().droppedEvents).toBe(48);
    expect(pipeline.events().length + context.traceLoss().droppedEvents).toBe(64);

    pipeline.close();
  });

  test("a pipeline that cannot shed reports no dropped events", () => {
    const events: unknown[] = [];
    const forwarding: EventPipeline = {
      publish: (event) => events.push(event),
      flush: () => {},
      events: () => [],
      clear: () => {},
      close: () => {},
    };
    const context = contextWith(forwarding);
    context.enterMethod("Svc", "op", []);

    expect(context.traceLoss().droppedEvents).toBe(0);
  });

  test("reset clears the refusal counts with the rest of the request", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const context = contextWith(pipeline, 1);
    context.adopt(new Set(["a" as SpanId, "b" as SpanId]));

    context.reset();

    expect(context.traceLoss()).toEqual(NO_TRACE_LOSS);

    pipeline.close();
  });
});
