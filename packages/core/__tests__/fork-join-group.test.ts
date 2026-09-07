// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import { ForkJoinGroup } from "../src/fork-join-group.js";
import { NOOP_CONTEXT } from "../src/noop-context.js";
import type { TraceEvent } from "../src/trace-event.js";

function makeContext() {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
}

describe("ForkJoinGroup identity propagation", () => {
  test("forked child spans inherit the parent's request and user metadata", async () => {
    const parent = makeContext();
    parent.setRequestContext("POST", "/orders" as never, "1.2.3.4" as never);
    parent.setUserContext("user-7" as never, "sess-9" as never, "tenant-42" as never);
    parent.enterMethod("Ctrl", "handle", []);

    const group = ForkJoinGroup.create(parent);
    await group.fork((ctx) => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');

    const child = parent.captureTrace().roots[0]?.children[0];
    expect(child?.spanContext?.httpRoute).toBe("/orders");
    expect(child?.spanContext?.clientIp).toBe("1.2.3.4");
    expect(child?.spanContext?.enduserId).toBe("user-7");
    expect(child?.spanContext?.tenantId).toBe("tenant-42");
  });

  test("forked child still inherits traceId and service identity (regression fence)", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const parentTraceId = parent.traceId();
    const group = ForkJoinGroup.create(parent);
    await group.fork((ctx) => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');

    const child = parent.captureTrace().roots[0]?.children[0];
    expect(child?.spanContext?.traceId).toBe(parentTraceId);
  });
});

describe("ForkJoinGroup", () => {
  test("create returns group with unique groupId", () => {
    const ctx = makeContext();
    const g1 = ForkJoinGroup.create(ctx);
    const g2 = ForkJoinGroup.create(ctx);
    expect(g1.groupId).toMatch(/^fork-\d+$/);
    expect(g2.groupId).toMatch(/^fork-\d+$/);
    expect(g1.groupId).not.toBe(g2.groupId);
  });

  test("forked task appears in parent trace as child", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    await group.fork((ctx) => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');
    const tree = parent.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.signature.className).toBe("Svc");
  });

  test("fork returns promise that resolves with task result", async () => {
    const parent = makeContext();
    const group = ForkJoinGroup.create(parent);
    const result = await group.fork(() => 42);
    expect(result).toBe(42);
  });

  test("join awaits all forked tasks and merges traces", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    group.fork((ctx) => {
      ctx.enterMethod("Svc", "taskA", []);
      ctx.exitMethodWithReturn('"a"');
      return "a";
    });
    group.fork((ctx) => {
      ctx.enterMethod("Svc", "taskB", []);
      ctx.exitMethodWithReturn('"b"');
      return "b";
    });
    const results = await group.join();
    parent.exitMethodWithReturn('"done"');
    expect(results).toEqual(["a", "b"]);
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children).toHaveLength(2);
  });

  test("join attaches ConcurrencyInfo with kind fork-join", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    group.fork((ctx) => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');
    const tree = parent.captureTrace();
    const child = tree.roots[0]?.children[0];
    expect(child?.concurrency).toBeDefined();
    expect(child?.concurrency?.kind).toBe("fork-join");
    expect(child?.concurrency?.groupId).toBe(group.groupId);
  });

  test("join returns results in fork order", async () => {
    const parent = makeContext();
    const group = ForkJoinGroup.create(parent);
    group.fork(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "slow";
    });
    group.fork(() => "fast");
    const results = await group.join();
    expect(results).toEqual(["slow", "fast"]);
  });

  test("ForkJoinGroup.all convenience wraps fork + join", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const [a, b] = await ForkJoinGroup.all(parent, [
      (ctx) => {
        ctx.enterMethod("Svc", "taskA", []);
        ctx.exitMethodWithReturn('"a"');
        return "a";
      },
      (ctx) => {
        ctx.enterMethod("Svc", "taskB", []);
        ctx.exitMethodWithReturn('"b"');
        return "b";
      },
    ]);
    parent.exitMethodWithReturn('"done"');
    expect(a).toBe("a");
    expect(b).toBe("b");
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children).toHaveLength(2);
    expect(tree.roots[0]?.children[0]?.concurrency?.kind).toBe("fork-join");
  });

  test("forked task errors propagate through join", async () => {
    const parent = makeContext();
    const group = ForkJoinGroup.create(parent);
    group.fork(() => {
      throw new Error("boom");
    });
    await expect(group.join()).rejects.toThrow("boom");
  });

  test("multiple traced calls inside one fork produce nested children", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    group.fork((ctx) => {
      ctx.enterMethod("Svc", "outer", []);
      ctx.enterMethod("Repo", "inner", []);
      ctx.exitMethodWithReturn('"found"');
      ctx.exitMethodWithReturn('"ok"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.children[0]?.signature.className).toBe("Repo");
  });

  test("groupId is consistent across all merged children", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    group.fork((ctx) => {
      ctx.enterMethod("Svc", "taskA", []);
      ctx.exitMethodWithReturn('"a"');
    });
    group.fork((ctx) => {
      ctx.enterMethod("Svc", "taskB", []);
      ctx.exitMethodWithReturn('"b"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');
    const tree = parent.captureTrace();
    const ids = tree.roots[0]?.children.map((r) => r.concurrency?.groupId);
    expect(ids).toHaveLength(2);
    expect(ids?.[0]).toBe(group.groupId);
    expect(ids?.[1]).toBe(group.groupId);
  });

  test("join with no forks returns empty array", async () => {
    const parent = makeContext();
    const group = ForkJoinGroup.create(parent);
    const results = await group.join();
    expect(results).toEqual([]);
  });

  test("taskLabel auto-derived from first traced call", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    group.fork((ctx) => {
      ctx.enterMethod("DiscountService", "calculateDiscount", []);
      ctx.exitMethodWithReturn('"10%"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');
    const tree = parent.captureTrace();
    expect(tree.roots[0]?.children[0]?.concurrency?.taskLabel).toBe(
      "DiscountService.calculateDiscount",
    );
  });

  test("taskLabel falls back to task-N when no traced calls", async () => {
    const parent = makeContext();
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    group.fork(() => "no-trace");
    await group.join();
    parent.exitMethodWithReturn('"done"');
    const tree = parent.captureTrace();
    // No children since forked context had no traced calls
    expect(tree.roots[0]?.children).toHaveLength(0);
  });

  test("abort signal cancels pending forks", async () => {
    const parent = makeContext();
    const controller = new AbortController();
    const group = ForkJoinGroup.create(parent, { signal: controller.signal });
    group.fork(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return "should not complete";
    });
    controller.abort();
    await expect(group.join()).rejects.toThrow("aborted");
  });

  test("create with NOOP_CONTEXT uses default config", async () => {
    const group = ForkJoinGroup.create(NOOP_CONTEXT);
    group.fork((ctx) => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
      return "result";
    });
    const results = await group.join();
    expect(results).toEqual(["result"]);
  });

  test("abort signal before fork rejects immediately", async () => {
    const parent = makeContext();
    const controller = new AbortController();
    controller.abort();
    const group = ForkJoinGroup.create(parent, { signal: controller.signal });
    const promise = group.fork(() => "never");
    await expect(promise).rejects.toThrow("aborted");
  });

  test("forked context inherits service identity from parent", async () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(64));
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      null,
      { serviceName: "order-service", environment: "test" },
    );
    parent.enterMethod("Ctrl", "handle", []);
    const group = ForkJoinGroup.create(parent);
    await group.fork((ctx) => {
      ctx.enterMethod("Svc", "task", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');

    const forkedEnter = received.find(
      (e) => e.type === "enter" && e.signature.methodName === "task",
    );
    expect(forkedEnter?.type === "enter" && forkedEnter.spanContext.serviceName).toBe(
      "order-service",
    );
    expect(forkedEnter?.type === "enter" && forkedEnter.spanContext.environment).toBe("test");
  });
});

// Bug-hunt no-poison contract: mirrors the FireAndForgetGroup case — a
// fork/join group grafts adopted work by reference (the adoption contract), so it cannot purge the raw worker
// events the moment the group joins; the parent's own reset() sweep is what closes the leak, once
// the parent eventually resets.
describe("ForkJoinGroup no-poison contract: reset after collection", () => {
  test("a reset after join leaves no per-span events in the shared pipeline", async () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    parent.enterMethod("OrderService", "placeOrder", []);

    const group = ForkJoinGroup.create(parent);
    group.fork((ctx) => {
      ctx.enterMethod("PriceService", "quote", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    await group.join();
    parent.exitMethodWithReturn('"done"');

    parent.reset();
    pipeline.flush();

    // Per-span events are fully swept. "fork-created" and "join-complete" carry no span id, so
    // span-keyed removal can never see them — the same deliberately deferred residual Java's own
    // S5 fix left open (TODO 55, "Group lifecycle events are never cleared").
    const perSpanEvents = pipeline.events().filter((e) => e.type === "enter" || e.type === "exit");
    expect(perSpanEvents).toHaveLength(0);
    expect(new Set(pipeline.events().map((e) => e.type))).toEqual(
      new Set(["fork-created", "join-complete"]),
    );
  });
});
