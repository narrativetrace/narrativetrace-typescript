// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";
import { spanIdOf } from "../src/event-store-consumer.js";
import { ForkJoinGroup } from "../src/fork-join-group.js";
import type { EnterEvent } from "../src/trace-event.js";
import type { TraceNode } from "../src/trace-node.js";
import type { TraceTree } from "../src/trace-tree.js";

/**
 * B-211: spans that no context ever captures or resets are released, and handed-over work is
 * captured exactly as before.
 *
 * INTENT: the review of 2026-10-27 measured an unbounded leak in every runtime — a context nobody
 * resets (an app-lifetime context in a page or a framework provider, the process-wide default
 * scope of the Node context) kept every span it traced in its span maps and, because the drain
 * timer moves every event into the shared store, every event too. It also kept one trace id for
 * life. The shapes here are the Java reproducers (`UnownedSpanReleaseTest`) on this runtime's
 * contexts: the unowned-retention limit is lowered through the `unownedSpanLimit` option, so a few
 * thousand iterations cross it many times over, and every assertion is a constant bound, never a
 * timing.
 */
describe("unowned span release (B-211)", () => {
  /** The unowned-retention limit these tests run under: small, so it is crossed many times. */
  const LIMIT = 64;
  /** Iterations of unowned work: thirty times the limit's worth of spans and more. */
  const ITERATIONS = 2_000;
  /**
   * What "bounded" means: the limit, plus the latest root of each live context (never released,
   * so a later capture there sees it whole), with room to spare — and an order of magnitude below
   * what the unfixed code retains after {@link ITERATIONS}.
   */
  const BOUND = 4 * LIMIT;

  let pipeline: EventPipeline;

  beforeEach(() => {
    pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1 << 16));
  });

  afterEach(() => pipeline.close());

  /** A context on the suite's pipeline; the first one built sets the pipeline's limit. */
  function context(): SyncNarrativeContext {
    return new SyncNarrativeContext(new NarrativeTraceConfig("detail"), {
      pipeline,
      unownedSpanLimit: LIMIT,
    } as ConstructorParameters<typeof SyncNarrativeContext>[1]);
  }

  /** One root with one child: the two-span shape every review experiment used. */
  function call(ctx: SyncNarrativeContext, type: string, method: string): void {
    ctx.enterMethod(type, method, []);
    ctx.enterMethod(type, "inner", []);
    ctx.exitMethodWithReturn('"done"');
    ctx.exitMethodWithReturn('"done"');
  }

  function names(tree: TraceTree): string[] {
    const out: string[] = [];
    const walk = (node: TraceNode): void => {
      out.push(`${node.signature.className}.${node.signature.methodName}`);
      for (const child of node.children) walk(child);
    };
    for (const root of tree.roots) walk(root);
    return out;
  }

  function storedSpans(): number {
    pipeline.flush();
    return new Set(pipeline.events().map((e) => spanIdOf(e))).size;
  }

  /** Span contexts the context still holds (retention is invisible from the public surface). */
  function retained(ctx: SyncNarrativeContext): number {
    return (ctx as unknown as { spanContextMap: Map<unknown, unknown> }).spanContextMap.size;
  }

  function rootEnters(): EnterEvent[] {
    pipeline.flush();
    return pipeline
      .events()
      .filter((e): e is EnterEvent => e.type === "enter" && e.spanContext.parentSpanId === null);
  }

  // ------------------------------------------------------------------ the leak, bounded

  test("agent-only shape: a context nobody captures keeps a bounded number of spans", () => {
    const ctx = context();
    for (let i = 0; i < ITERATIONS; i++) call(ctx, "Svc", "work");

    expect(retained(ctx), "span contexts are released when their span exits").toBeLessThanOrEqual(
      BOUND,
    );
    expect(
      ctx.knownSpanIds().size,
      "the context's own known set stays bounded",
    ).toBeLessThanOrEqual(BOUND);
    expect(storedSpans(), "and so does the store the drain timer feeds").toBeLessThanOrEqual(BOUND);
  });

  test("prod-leak shape: unowned work beside claimed requests leaves a bounded store", () => {
    const request = context();
    const pool = context();
    for (let i = 1; i <= ITERATIONS; i++) {
      request.reset();
      call(request, "Request", "handle");
      call(pool, "Pool", "work");
      expect(names(request.captureTrace()), "each capture is exactly its own work").toEqual([
        "Request.handle",
        "Request.inner",
      ]);
      request.reset();
    }

    expect(storedSpans(), "unhanded-over events no longer accumulate").toBeLessThanOrEqual(BOUND);
    expect(retained(pool)).toBeLessThanOrEqual(BOUND);
    expect(
      pool.knownSpanIds().size,
      "the pool context's known set stays bounded",
    ).toBeLessThanOrEqual(BOUND);
  });

  test("two consecutive roots on an unowned context are two traces", () => {
    const pool = context();
    call(pool, "Pool", "first");
    call(pool, "Pool", "second");

    const roots = rootEnters();
    expect(roots).toHaveLength(2);
    expect(
      roots[0]?.spanContext.traceId,
      "a context nobody hands over must not correlate unrelated work",
    ).not.toBe(roots[1]?.spanContext.traceId);
    expect(roots[1]?.spanContext.storyId, "its next story is its next root's").toBe("Pool.second");
  });

  test("asking for the trace id between roots continues that trace", () => {
    const pool = context();
    call(pool, "Pool", "first");
    const asked = pool.traceId();
    call(pool, "Pool", "second");

    const roots = rootEnters();
    expect(asked).toBe(roots[0]?.spanContext.traceId);
    expect(asked).toBe(roots[1]?.spanContext.traceId);
  });

  test("a snapshot between roots continues that trace", () => {
    const pool = context();
    call(pool, "Pool", "first");
    pool.snapshot();
    call(pool, "Pool", "second");

    const roots = rootEnters();
    expect(roots[0]?.spanContext.traceId).toBe(roots[1]?.spanContext.traceId);
  });

  test("released spans are counted on their own context and nowhere else", () => {
    const ctx = context();
    const roots = 10 * LIMIT;
    for (let i = 0; i < roots; i++) call(ctx, "Svc", "work");
    const bystander = context();
    bystander.reset();
    call(bystander, "Bystander", "work");
    const bystanderTree = bystander.captureTrace();

    const tree = ctx.captureTrace();

    const missing = 2 * roots - names(tree).length;
    expect(missing, "the oldest unowned roots were released").toBeGreaterThan(0);
    expect(ctx.traceLoss().refusedSpans, "and what is missing is counted here, exactly").toBe(
      missing,
    );
    expect(names(bystanderTree)).toEqual(["Bystander.work", "Bystander.inner"]);
    expect(bystander.traceLoss().refusedSpans + bystander.traceLoss().discardedSpans).toBe(0);
  });

  // ------------------------------------------------------------- owned work, unchanged

  test("a claimed context keeps one trace and loses nothing past the limit", () => {
    const ctx = context();
    ctx.reset();
    const roots = 5 * LIMIT;
    for (let i = 0; i < roots; i++) call(ctx, "Svc", "work");

    const tree = ctx.captureTrace();

    expect(tree.roots).toHaveLength(roots);
    expect(new Set(tree.roots.map((r) => r.spanContext?.traceId)).size).toBe(1);
    expect(ctx.traceLoss().refusedSpans).toBe(0);
  });

  test("a capture before any claim still sees everything under the limit", () => {
    const ctx = context();
    call(ctx, "Svc", "first");
    call(ctx, "Svc", "second");

    expect(names(ctx.captureTrace()).sort()).toEqual(
      ["Svc.first", "Svc.inner", "Svc.second", "Svc.inner"].sort(),
    );
  });

  test("the latest root of a live context is never released, even when larger than the limit", () => {
    const ctx = context();
    const noise = context();
    const root = ctx.enterMethod("Big", "root", []);
    for (let i = 0; i < 3 * LIMIT; i++) {
      ctx.enterMethod("Big", "child", []);
      ctx.exitMethodWithReturn('"ok"');
    }
    ctx.exitMethodWithReturn('"ok"', root);
    for (let i = 0; i < 10 * LIMIT; i++) call(noise, "Noise", "work");

    const tree = ctx.captureTrace();

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(3 * LIMIT);
    expect(ctx.traceLoss().refusedSpans).toBe(0);
  });

  test("handed-over work is captured exactly as before under unowned noise", async () => {
    const noise = context();
    const flood = (): void => {
      for (let i = 0; i < 10 * LIMIT; i++) call(noise, "Noise", "work");
    };
    flood();
    const ctx = context();
    ctx.reset();
    const root = ctx.enterMethod("Test", "main", []);
    await ForkJoinGroup.all(ctx, [
      (c) => call(c as SyncNarrativeContext, "Fork", "a"),
      (c) => call(c as SyncNarrativeContext, "Fork", "b"),
    ]);
    flood();
    const worker = context();
    ctx.snapshot().wrapFn(worker, () => call(worker, "Snap", "w"));
    const liveWorker = context();
    const live = ctx.snapshot().activate(liveWorker);
    call(liveWorker, "Live", "w");
    flood();
    ctx.exitMethodWithReturn('"ok"', root);

    const tree = ctx.captureTrace();
    live.close();

    expect(names(tree).sort()).toEqual(
      [
        "Test.main",
        "Fork.a",
        "Fork.inner",
        "Fork.b",
        "Fork.inner",
        "Snap.w",
        "Snap.inner",
        "Live.w",
        "Live.inner",
      ].sort(),
    );
    expect(ctx.traceLoss().refusedSpans + ctx.traceLoss().discardedSpans).toBe(0);
  });
});
