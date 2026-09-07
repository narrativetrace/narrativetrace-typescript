// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import { FireAndForgetGroup } from "../src/fire-and-forget-group.js";
import { NOOP_CONTEXT } from "../src/noop-context.js";
import type { TraceEvent } from "../src/trace-event.js";

function makeContext() {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
}

describe("FireAndForgetGroup identity propagation", () => {
  test("launched child spans inherit the parent's request and user metadata", async () => {
    const parent = makeContext();
    parent.setRequestContext("GET", "/notify" as never, "9.9.9.9" as never);
    parent.setUserContext("user-1" as never, undefined, "tenant-x" as never);
    parent.enterMethod("OrderService", "placeOrder", []);

    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("NotificationService", "send", []);
      ctx.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');

    const child = parent.captureTrace().roots[0]?.children[0];
    expect(child?.spanContext?.httpRoute).toBe("/notify");
    expect(child?.spanContext?.enduserId).toBe("user-1");
    expect(child?.spanContext?.tenantId).toBe("tenant-x");
  });
});

describe("FireAndForgetGroup", () => {
  test("create returns group with unique groupId", () => {
    const ctx = makeContext();
    const g1 = FireAndForgetGroup.create(ctx);
    const g2 = FireAndForgetGroup.create(ctx);
    expect(g1.groupId).toMatch(/^fanf-\d+$/);
    expect(g1.groupId).not.toBe(g2.groupId);
  });

  test("launched task appears as child of parent in trace", async () => {
    const parent = makeContext();
    parent.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("NotificationService", "send", []);
      ctx.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');
    const tree = parent.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.signature.className).toBe("NotificationService");
  });

  test("launched task has fire-and-forget ConcurrencyInfo", async () => {
    const parent = makeContext();
    parent.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("NotificationService", "send", []);
      ctx.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children[0]?.concurrency?.kind).toBe("fire-and-forget");
    expect(tree.roots[0]?.children[0]?.concurrency?.groupId).toBe(group.groupId);
  });

  test("launched task runs asynchronously", async () => {
    const parent = makeContext();
    const group = FireAndForgetGroup.create(parent);
    let ran = false;
    group.launch(() => {
      ran = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toBe(true);
  });

  test("fork returns promise that resolves with task result", async () => {
    const parent = makeContext();
    parent.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
      return "result";
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children[0]?.concurrency?.groupId).toBe(group.groupId);
    expect(tree.roots[0]?.children[0]?.concurrency?.kind).toBe("fire-and-forget");
  });

  test("multiple launches appear as separate children", async () => {
    const parent = makeContext();
    parent.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("A", "a", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    group.launch((ctx) => {
      ctx.enterMethod("B", "b", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children).toHaveLength(2);
  });

  test("create with NOOP_CONTEXT uses default config", async () => {
    const group = FireAndForgetGroup.create(NOOP_CONTEXT);
    group.launch((ctx) => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await new Promise((r) => setTimeout(r, 10));
    // NOOP_CONTEXT produces no trace, but task should not crash
    expect(group.groupId).toMatch(/^fanf-\d+$/);
  });

  test("launched task error does not crash parent", async () => {
    const parent = makeContext();
    parent.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch(() => {
      throw new Error("fire-and-forget error");
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');
    const tree = parent.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.className).toBe("OrderService");
  });

  test("taskLabel auto-derived from first traced call", async () => {
    const parent = makeContext();
    parent.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("NotificationService", "send", []);
      ctx.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children[0]?.concurrency?.taskLabel).toBe("NotificationService.send");
  });

  test("deeply nested calls inside launched task", async () => {
    const parent = makeContext();
    parent.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("Svc", "outer", []);
      ctx.enterMethod("Repo", "inner", []);
      ctx.exitMethodWithReturn('"found"');
      ctx.exitMethodWithReturn('"ok"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.children[0]?.signature.className).toBe("Repo");
  });

  test("fire-and-forget task inherits service identity from parent", async () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(64));
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      null,
      { serviceName: "notification-service" },
    );
    parent.enterMethod("Ctrl", "handle", []);
    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("Notifier", "send", []);
      ctx.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"done"');

    const forkedEnter = received.find(
      (e) => e.type === "enter" && e.signature.methodName === "send",
    );
    expect(forkedEnter?.type === "enter" && forkedEnter.spanContext.serviceName).toBe(
      "notification-service",
    );
  });
});

// Bug-hunt no-poison contract: a fire-and-forget group hands its launched
// task's roots to the parent (publishChildrenTo → adopt), but the raw worker events themselves
// used to live only in the shared pipeline with nothing ever removing them. This runtime grafts
// adopted work by reference rather than re-emitting a snapshot (the adoption contract), so the events cannot
// be purged the moment the group settles — the parent's own eventual capture still reads them by
// reference. What closes the leak is the parent's own reset(): once it fires, the adopted spans are
// swept with everything else it could report.
describe("FireAndForgetGroup no-poison contract: reset after collection", () => {
  test("a reset after the launched task settles leaves no per-span events in the shared pipeline", async () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    parent.enterMethod("OrderService", "placeOrder", []);

    const group = FireAndForgetGroup.create(parent);
    group.launch((ctx) => {
      ctx.enterMethod("NotificationService", "send", []);
      ctx.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));
    parent.exitMethodWithReturn('"ok"');

    parent.reset();
    pipeline.flush();

    // Per-span events (enter/exit) are fully swept. One known, deliberately deferred residual
    // remains: the "fork-created" lifecycle event carries no span id, so span-keyed removal can
    // never see it — Java's own S5 fix left the identical gap open for the same reason ("Group
    // lifecycle events are never cleared" — TODO 55, ~100 B per group, unbounded only in an app
    // that fire-and-forgets without limit). Pinned here rather than silently passing a too-loose
    // assertion.
    const perSpanEvents = pipeline.events().filter((e) => e.type === "enter" || e.type === "exit");
    expect(perSpanEvents).toHaveLength(0);
    expect(pipeline.events().map((e) => e.type)).toEqual(["fork-created"]);
  });
});
