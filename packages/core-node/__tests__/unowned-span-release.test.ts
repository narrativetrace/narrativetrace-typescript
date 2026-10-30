// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { AsyncResource } from "node:async_hooks";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  type EnterEvent,
  type EventPipeline,
  ForkJoinGroup,
  type NarrativeContext,
  NarrativeTraceConfig,
  SyncNarrativeContext,
  type TraceId,
  type TraceNode,
  type TraceTree,
} from "@narrativetrace/core";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AsyncNarrativeContext } from "../src/async-context.js";

/**
 * B-211 on the Node context: the process-wide default scope (work no `run()` wraps — a pool bound
 * at startup, a timer, the agent on a batch job) and a top-level `run()` that ends without
 * `reset()` are the contexts nothing owns. Their spans are released in bounded batches; a request
 * that claims its scope, and everything handed over to it, is captured exactly as before.
 *
 * INTENT: the Java reproducers (`UnownedSpanReleaseTest`) in this runtime's shape. A "pool worker"
 * here is an `AsyncResource` created outside every scope, so the work it runs reads the default
 * scope however it was queued — the way a connection pool or a queue consumer created at startup
 * loses the request's `AsyncLocalStorage`. The limit is lowered through the `unownedSpanLimit`
 * seam, which belongs to the pipeline; every assertion is a constant bound, never a timing.
 */
describe("unowned span release on the Node context (B-211)", () => {
  const LIMIT = 64;
  const ITERATIONS = 2_000;
  const BOUND = 4 * LIMIT;

  let pipeline: EventPipeline;
  let ctx: AsyncNarrativeContext;
  /** The startup-bound worker: whatever it runs reads the default scope. */
  let pool: AsyncResource;

  beforeEach(() => {
    pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1 << 16));
    // The limit belongs to the pipeline's release queue; any context on it can set it.
    new SyncNarrativeContext(new NarrativeTraceConfig("detail"), {
      pipeline,
      unownedSpanLimit: LIMIT,
    } as ConstructorParameters<typeof SyncNarrativeContext>[1]);
    ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
    pool = new AsyncResource("narrativetrace-test-pool");
  });

  afterEach(() => pipeline.close());

  function call(type: string, method: string, on: NarrativeContext = ctx): void {
    on.enterMethod(type, method, []);
    on.enterMethod(type, "inner", []);
    on.exitMethodWithReturn('"done"');
    on.exitMethodWithReturn('"done"');
  }

  function onPool(type: string, method: string): void {
    pool.runInAsyncScope(() => call(type, method));
  }

  function names(tree: TraceTree): string[] {
    const out: string[] = [];
    const walk = (node: TraceNode): void => {
      out.push(`${node.signature.className}.${node.signature.methodName}`);
      for (const child of node.children) walk(child);
    };
    for (const root of tree.roots) walk(root);
    return out.sort();
  }

  function storedSpans(): number {
    pipeline.flush();
    return new Set(
      pipeline.events().map((e) => ("spanContext" in e ? e.spanContext.spanId : e.type)),
    ).size;
  }

  function defaultScope(): SyncNarrativeContext {
    return pool.runInAsyncScope(() => ctx.activeScope);
  }

  function retained(scope: SyncNarrativeContext): number {
    return (scope as unknown as { spanContextMap: Map<unknown, unknown> }).spanContextMap.size;
  }

  function rootEnters(): EnterEvent[] {
    pipeline.flush();
    return pipeline
      .events()
      .filter((e): e is EnterEvent => e.type === "enter" && e.spanContext.parentSpanId === null);
  }

  test("agent-only shape: the default scope keeps a bounded number of spans", () => {
    for (let i = 0; i < ITERATIONS; i++) onPool("Svc", "work");

    const scope = defaultScope();
    expect(retained(scope)).toBeLessThanOrEqual(BOUND);
    expect(scope.knownSpanIds().size).toBeLessThanOrEqual(BOUND);
    expect(storedSpans()).toBeLessThanOrEqual(BOUND);
  });

  test("prod-leak shape: unwrapped pool work and un-reset scopes beside requests leave a bounded store", async () => {
    for (let i = 1; i <= ITERATIONS; i++) {
      const captured = await ctx.run(async () => {
        ctx.reset();
        call("Request", "handle");
        onPool("Pool", "work");
        const tree = ctx.captureTrace();
        ctx.reset();
        return tree;
      });
      expect(names(captured), "each request's capture is exactly its own work").toEqual([
        "Request.handle",
        "Request.inner",
      ]);
      if (i % 2 === 0) await ctx.run(async () => call("Raw", "work"));
    }

    expect(storedSpans(), "unhanded-over events no longer accumulate").toBeLessThanOrEqual(BOUND);
    expect(defaultScope().knownSpanIds().size).toBeLessThanOrEqual(BOUND);
  });

  test("two consecutive roots on the default scope are two traces", () => {
    onPool("Pool", "first");
    onPool("Pool", "second");

    const roots = rootEnters();
    expect(roots).toHaveLength(2);
    expect(roots[0]?.spanContext.traceId).not.toBe(roots[1]?.spanContext.traceId);
    expect(roots[1]?.spanContext.storyId).toBe("Pool.second");
  });

  test("two consecutive roots in one un-reset scope are two traces", async () => {
    await ctx.run(async () => {
      call("Job", "first");
      call("Job", "second");
    });

    const roots = rootEnters();
    expect(roots).toHaveLength(2);
    expect(roots[0]?.spanContext.traceId).not.toBe(roots[1]?.spanContext.traceId);
  });

  test("asking for the trace id between roots continues that trace", () => {
    onPool("Pool", "first");
    const asked = pool.runInAsyncScope(() => ctx.traceId());
    onPool("Pool", "second");

    const roots = rootEnters();
    expect(asked).toBe(roots[0]?.spanContext.traceId);
    expect(asked).toBe(roots[1]?.spanContext.traceId);
  });

  test("a scope adopting an inbound traceparent is claimed: one trace, nothing released", async () => {
    const inbound = "4bf92f3577b34da6a3ce929d0e0e4736" as TraceId;
    const tree = await ctx.run(async () => {
      for (let i = 0; i < 5 * LIMIT; i++) call("Svc", "work");
      for (let i = 0; i < 10 * LIMIT; i++) onPool("Noise", "work");
      return ctx.captureTrace();
    }, inbound);

    expect(tree.roots).toHaveLength(5 * LIMIT);
    expect(new Set(tree.roots.map((r) => r.spanContext?.traceId))).toEqual(new Set([inbound]));
  });

  test("a nested scope still open at capture is captured under unowned noise", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const tree = await ctx.run(async () => {
      ctx.reset();
      const root = ctx.enterMethod("Test", "main", []);
      for (let i = 0; i < 10 * LIMIT; i++) onPool("Noise", "work");
      await ForkJoinGroup.all(ctx, [(c) => call("Fork", "a", c), (c) => call("Fork", "b", c)]);
      const background = ctx.run(async () => {
        call("Live", "w");
        await held;
      });
      for (let i = 0; i < 10 * LIMIT; i++) onPool("Noise", "work");
      ctx.exitMethodWithReturn('"ok"', root);
      const captured = ctx.captureTrace();
      const loss = ctx.traceLoss();
      release();
      await background;
      expect(loss.refusedSpans + loss.discardedSpans).toBe(0);
      return captured;
    });

    expect(names(tree)).toEqual(
      ["Test.main", "Fork.a", "Fork.inner", "Fork.b", "Fork.inner", "Live.w", "Live.inner"].sort(),
    );
  });

  test("concurrent claimed requests sharing a pool with unwrapped noise capture only their own work", async () => {
    const tags = ["P0", "P1", "P2", "P3"];
    const failures: string[] = [];
    for (let round = 0; round < 20; round++) {
      await Promise.all(
        tags.map((tag) =>
          ctx.run(async () => {
            ctx.reset();
            const root = ctx.enterMethod(tag, "main", []);
            await ForkJoinGroup.all(ctx, [(c) => call(tag, "fork", c)]);
            await ctx.run(async () => {
              await Promise.resolve();
              call(tag, "nested");
            });
            onPool(tag, "unwrapped");
            for (let i = 0; i < LIMIT; i++) onPool("Noise", "work");
            ctx.exitMethodWithReturn('"ok"', root);
            const captured = names(ctx.captureTrace());
            const expected = [
              `${tag}.main`,
              `${tag}.fork`,
              `${tag}.inner`,
              `${tag}.nested`,
              `${tag}.inner`,
            ].sort();
            if (captured.join() !== expected.join()) failures.push(`${tag} ${round}: ${captured}`);
            ctx.reset();
          }),
        ),
      );
    }
    expect(failures).toEqual([]);
  });
});
