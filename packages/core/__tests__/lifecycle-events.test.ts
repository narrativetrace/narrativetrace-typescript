// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { SpanId } from "../src/span-id-generator.js";
import type { ForkCreatedEvent, JoinCompleteEvent, TraceEvent } from "../src/trace-event.js";

function forkCreatedEvent(overrides?: Partial<ForkCreatedEvent>): ForkCreatedEvent {
  return {
    type: "fork-created",
    groupId: "fork-1",
    parentSpanId: "0000000000000000",
    rootSpanId: "0000000000000001",
    strategy: "fork-join",
    timestamp: 100,
    ...overrides,
  };
}

function joinCompleteEvent(overrides?: Partial<JoinCompleteEvent>): JoinCompleteEvent {
  return {
    type: "join-complete",
    groupId: "fork-1",
    memberCount: 3,
    wallTimeMs: 42,
    timestamp: 200,
    ...overrides,
  };
}

describe("ForkCreatedEvent", () => {
  test("is a valid TraceEvent variant", () => {
    const traceEvent: TraceEvent = forkCreatedEvent();
    expect(traceEvent.type).toBe("fork-created");
  });
});

describe("JoinCompleteEvent", () => {
  test("is a valid TraceEvent variant", () => {
    const traceEvent: TraceEvent = joinCompleteEvent();
    expect(traceEvent.type).toBe("join-complete");
  });
});

describe("lifecycle events through pipeline", () => {
  test("ForkCreatedEvent flows through DualPathPipeline", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const event = forkCreatedEvent();
    pipeline.publish(event);
    pipeline.flush();
    expect(pipeline.events()).toContainEqual(event);
  });

  test("JoinCompleteEvent flows through DualPathPipeline", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const event = joinCompleteEvent();
    pipeline.publish(event);
    pipeline.flush();
    expect(pipeline.events()).toContainEqual(event);
  });

  test("captureTrace excludes lifecycle events from foreign scopes", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    const handle = ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"', handle);

    pipeline.publish(forkCreatedEvent({ parentSpanId: "ffffffffffffffff" }));
    pipeline.publish(joinCompleteEvent());

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.className).toBe("Svc");
  });
});

describe("activeSpanId accessor", () => {
  test("returns null when stack is empty", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    expect(ctx.activeSpanId).toBeNull();
  });

  test("returns top of activeStack", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const handle = ctx.enterMethod("Svc", "op", []);
    expect(ctx.activeSpanId).toBe(handle);
  });

  test("returns innermost spanId when nested", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    ctx.enterMethod("Svc", "outer", []);
    const inner = ctx.enterMethod("Svc", "inner", []);
    expect(ctx.activeSpanId).toBe(inner);
  });
});

describe("knownSpanIds accessor", () => {
  test("returns empty set when no methods entered", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    expect(ctx.knownSpanIds().size).toBe(0);
  });

  test("contains all spanIds created by the context", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const h1 = ctx.enterMethod("A", "a", []);
    const h2 = ctx.enterMethod("B", "b", []);
    ctx.exitMethodWithReturn('"ok"', h2);
    ctx.exitMethodWithReturn('"ok"', h1);
    const spanIds = ctx.knownSpanIds();
    expect(spanIds.has(h1)).toBe(true);
    expect(spanIds.has(h2)).toBe(true);
    expect(spanIds.size).toBe(2);
  });
});

describe("pipeline accessor", () => {
  test("SyncNarrativeContext exposes its pipeline", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    expect(ctx.eventPipeline).toBe(pipeline);
  });

  test("SyncNarrativeContext creates default pipeline when none provided", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    expect(ctx.eventPipeline).toBeDefined();
  });
});

describe("transitive scope reporting", () => {
  test("captureTrace includes what a live child published to it", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    const parentHandle = parent.enterMethod("Ctrl", "handle", []);

    const forked = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      parentHandle,
    );
    parent.registerLiveChild(forked);
    const forkedHandle = forked.enterMethod("Svc", "task", []);
    forked.exitMethodWithReturn('"ok"', forkedHandle);

    parent.exitMethodWithReturn('"done"', parentHandle);

    const tree = parent.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.signature.className).toBe("Svc");
  });

  test("a child that published nothing and registered nothing stays out", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    const parentHandle = parent.enterMethod("Ctrl", "handle", []);

    // Parented by span id alone: nothing was registered and nothing handed over, so the parent
    // cannot answer for it. A parent link is not a publication.
    const detached = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      parentHandle,
    );
    detached.exitMethodWithReturn('"ok"', detached.enterMethod("Svc", "task", []));
    parent.exitMethodWithReturn('"done"', parentHandle);

    expect(parent.captureTrace().roots[0]?.children).toHaveLength(0);
  });

  test("includes deeply nested calls a child handed over at close", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    const parentHandle = parent.enterMethod("Ctrl", "handle", []);

    const forked = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      parentHandle,
    );
    const outerHandle = forked.enterMethod("Svc", "outer", []);
    const innerHandle = forked.enterMethod("Repo", "inner", []);
    forked.exitMethodWithReturn('"found"', innerHandle);
    forked.exitMethodWithReturn('"ok"', outerHandle);
    parent.adopt(forked.reportableSpanIds());
    parent.exitMethodWithReturn('"done"', parentHandle);

    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.children[0]?.signature.className).toBe("Repo");
  });

  test("forked context captureTrace only sees its own events", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    const parentHandle = parent.enterMethod("Ctrl", "handle", []);

    const forked = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      parentHandle,
    );
    const forkedHandle = forked.enterMethod("Svc", "task", []);
    forked.exitMethodWithReturn('"ok"', forkedHandle);
    parent.exitMethodWithReturn('"done"', parentHandle);

    const forkedTree = forked.captureTrace();
    expect(forkedTree.roots).toHaveLength(1);
    expect(forkedTree.roots[0]?.signature.className).toBe("Svc");
  });

  test("multiple children that published appear in the parent trace", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    const parentHandle = parent.enterMethod("Ctrl", "handle", []);

    const forkedA = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      parentHandle,
    );
    const a = forkedA.enterMethod("Svc", "taskA", []);
    forkedA.exitMethodWithReturn('"a"', a);

    const forkedB = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      parentHandle,
    );
    const b = forkedB.enterMethod("Svc", "taskB", []);
    forkedB.exitMethodWithReturn('"b"', b);

    parent.adopt(forkedA.reportableSpanIds());
    parent.adopt(forkedB.reportableSpanIds());
    parent.exitMethodWithReturn('"done"', parentHandle);

    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children).toHaveLength(2);
  });
});

describe("rootParentOverride", () => {
  test("resolveParent falls back to rootParentOverride when stack is empty", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const overrideId = "aaaaaaaaaaaaaaaa" as SpanId;
    const ctx = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      overrideId,
    );
    const handle = ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"', handle);

    pipeline.flush();
    const enter = pipeline.events().find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.parentSpanId).toBe(overrideId);
  });

  test("parentResolver takes precedence over rootParentOverride", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const resolverSpanId = "bbbbbbbbbbbbbbbb" as SpanId;
    const overrideSpanId = "aaaaaaaaaaaaaaaa" as SpanId;
    const ctx = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      () => resolverSpanId,
      pipeline,
      overrideSpanId,
    );
    const handle = ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"', handle);

    pipeline.flush();
    const enter = pipeline.events().find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.parentSpanId).toBe(resolverSpanId);
  });

  test("defaults to null when not provided", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    const handle = ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"', handle);

    pipeline.flush();
    const enter = pipeline.events().find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.parentSpanId).toBeNull();
  });

  test("activeStack takes precedence over rootParentOverride", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
    const overrideId = "aaaaaaaaaaaaaaaa" as SpanId;
    const ctx = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      overrideId,
    );
    const outerHandle = ctx.enterMethod("Svc", "outer", []);
    const innerHandle = ctx.enterMethod("Svc", "inner", []);
    ctx.exitMethodWithReturn('"ok"', innerHandle);
    ctx.exitMethodWithReturn('"ok"', outerHandle);

    pipeline.flush();
    const events = pipeline.events().filter((e) => e.type === "enter");
    const innerEnter = events.find((e) => e.type === "enter" && e.signature.methodName === "inner");
    expect(innerEnter?.type === "enter" && innerEnter.spanContext.parentSpanId).toBe(outerHandle);
  });
});
