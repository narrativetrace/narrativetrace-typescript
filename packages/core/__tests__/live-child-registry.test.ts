// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";
import type { SpanId } from "../src/span-id-generator.js";

/**
 * The live-child registry — the ledger that makes an asynchronous child's spans reportable by the
 * origin while the child's scope is still open. Mirrors Java's `TraceStackLiveChildTest`: its
 * guards and its ceiling are boundary conditions an end-to-end test would need 10,000 in-flight
 * scopes to reach.
 */
describe("live-child registry", () => {
  let pipeline: EventPipeline;

  beforeEach(() => {
    pipeline = new DualPathPipeline(null, new BufferedEventConsumer(256));
  });

  afterEach(() => pipeline.close());

  /** A context with a deliberately tiny adoption ceiling, on the suite's shared pipeline. */
  function stack(maxAdoptedSpans = 5): SyncNarrativeContext {
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

  /** One finished call on `context`, returning the span id it opened. */
  function traceCall(context: SyncNarrativeContext, methodName = "op"): SpanId {
    const spanId = context.enterMethod("Svc", methodName, []);
    context.exitMethodWithReturn('"ok"');
    return spanId;
  }

  test("a context with no live children reports no spans", () => {
    expect(stack().liveChildSpanIds()).toEqual(new Set());
  });

  test("a live child's spans are reportable by the origin", () => {
    const origin = stack();
    const child = stack();
    origin.registerLiveChild(child);

    const spanId = traceCall(child);

    expect(origin.liveChildSpanIds()).toEqual(new Set([spanId]));
  });

  test("a live child contributes exactly what it will hand over at close", () => {
    const origin = stack();
    const child = stack();
    const own = traceCall(child, "own");
    const fromGrandchild = "grandchild-span" as SpanId;
    child.adopt(new Set([fromGrandchild]));
    origin.registerLiveChild(child);

    expect(origin.liveChildSpanIds()).toEqual(new Set([own, fromGrandchild]));
    // The live view and the hand-over set are one definition, not two.
    expect(child.reportableSpanIds()).toEqual(origin.liveChildSpanIds());
  });

  test("a live grandchild reaches the origin through its parent", () => {
    const origin = stack();
    const child = stack();
    const grandchild = stack();
    const childSpan = traceCall(child, "child");
    const grandchildSpan = traceCall(grandchild, "grandchild");
    origin.registerLiveChild(child);
    child.registerLiveChild(grandchild);

    expect(origin.liveChildSpanIds()).toEqual(new Set([childSpan, grandchildSpan]));
  });

  test("a chain of live contexts is walked to its end", () => {
    const contexts = Array.from({ length: 6 }, () => stack());
    const spans = contexts.map((context, depth) => traceCall(context, `depth${depth}`));
    for (let depth = 1; depth < contexts.length; depth++) {
      contexts[depth - 1]?.registerLiveChild(contexts[depth] as SyncNarrativeContext);
    }

    expect(contexts[0]?.reportableSpanIds()).toEqual(new Set(spans));
  });

  test("a context with nothing of its own still reports what its children have", () => {
    const origin = stack();
    const child = stack();
    const childSpan = traceCall(child);
    origin.registerLiveChild(child);

    expect(origin.reportableSpanIds()).toEqual(new Set([childSpan]));
  });

  test("a span reachable through both adoption and a live child is reported once", () => {
    const origin = stack();
    const child = stack();
    const shared = traceCall(child);
    origin.registerLiveChild(child);
    // The window scope close opens: adopt() has run, unregisterLiveChild() has not.
    origin.adopt(child.reportableSpanIds());

    expect(origin.reportableSpanIds()).toEqual(new Set([shared]));
  });

  test("the ceiling of the receiving context bounds what it accepts from a whole chain", () => {
    const origin = stack(2);
    const child = stack();
    traceCall(child);
    child.adopt(new Set(["a" as SpanId, "b" as SpanId]));

    // Three spans arrive as one batch; adoption is all-or-nothing, so the origin's own ceiling
    // refuses the chain whole rather than stranding a grandchild whose parent stayed out.
    origin.adopt(child.reportableSpanIds());

    expect(origin.adoptedSpans()).toEqual(new Set());
    expect(origin.refusedScopeCount()).toBe(1);
    expect(origin.refusedSpanCount()).toBe(3);
  });

  test("every live child contributes", () => {
    const origin = stack();
    const first = stack();
    const second = stack();
    const firstSpan = traceCall(first, "first");
    const secondSpan = traceCall(second, "second");

    origin.registerLiveChild(first);
    origin.registerLiveChild(second);

    expect(origin.liveChildSpanIds()).toEqual(new Set([firstSpan, secondSpan]));
  });

  test("unregistering ends the contribution", () => {
    const origin = stack();
    const child = stack();
    traceCall(child);
    const registration = origin.registerLiveChild(child);

    origin.unregisterLiveChild(registration);

    expect(origin.liveChildSpanIds()).toEqual(new Set());
  });

  test("unregistering a refused registration is harmless", () => {
    const origin = stack(1);
    const kept = stack(1);
    traceCall(kept);
    origin.registerLiveChild(kept);

    origin.unregisterLiveChild(null);

    expect(origin.liveChildSpanIds().size).toBe(1);
  });

  test("unregistering on a context that never registered is harmless", () => {
    const origin = stack();
    const other = stack();
    const registration = other.registerLiveChild(stack());

    origin.unregisterLiveChild(registration);

    expect(origin.liveChildSpanIds()).toEqual(new Set());
  });

  test("the ceiling refuses further registrations", () => {
    const origin = stack(1);
    const kept = stack(1);
    const refused = stack(1);
    traceCall(kept);
    traceCall(refused);

    expect(origin.registerLiveChild(kept)).not.toBeNull();
    expect(origin.registerLiveChild(refused)).toBeNull();
    expect(origin.liveChildSpanIds().size).toBe(1);
  });

  test("a refused registration is not counted as a lost scope", () => {
    const origin = stack(1);
    origin.registerLiveChild(stack(1));

    origin.registerLiveChild(stack(1));

    // Nothing is lost by a refusal here — the spans still arrive through adopt() at scope close.
    expect(origin.refusedScopeCount()).toBe(0);
    expect(origin.refusedSpanCount()).toBe(0);
  });

  test("a collected child contributes nothing and frees its slot", () => {
    const origin = stack(1);
    const collected = stack(1);
    traceCall(collected);
    // Clearing the handle is what the collector does to a child that died mid-scope.
    origin.registerLiveChild(collected)?.clear();

    expect(origin.liveChildSpanIds()).toEqual(new Set());

    const replacement = stack(1);
    traceCall(replacement);
    // The cleared registration must have been pruned, or the ceiling leaks slots.
    expect(origin.registerLiveChild(replacement)).not.toBeNull();
  });

  test("a context cannot register itself", () => {
    const origin = stack();

    expect(() => origin.registerLiveChild(origin)).toThrow(
      "A context cannot be its own live child",
    );
  });

  test("a missing child is rejected", () => {
    const origin = stack();

    expect(() => origin.registerLiveChild(null as unknown as SyncNarrativeContext)).toThrow(
      "Child context is required",
    );
  });

  test("an empty hand-over changes nothing", () => {
    const origin = stack(1);

    origin.adopt(new Set());

    expect(origin.adoptedSpans()).toEqual(new Set());
    expect(origin.refusedScopeCount()).toBe(0);
  });

  test("reset drops adoptions, live registrations and their refusal counts", () => {
    const origin = stack(1);
    const child = stack();
    traceCall(child);
    origin.registerLiveChild(child);
    origin.adopt(new Set(["a" as SpanId, "b" as SpanId]));

    origin.reset();

    expect(origin.reportableSpanIds()).toEqual(new Set());
    expect(origin.refusedScopeCount()).toBe(0);
    expect(origin.refusedSpanCount()).toBe(0);
  });
});
