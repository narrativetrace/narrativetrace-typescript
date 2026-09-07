// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BufferedEventConsumer } from "../../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../../src/config.js";
import { SyncNarrativeContext } from "../../src/context.js";
import { DualPathPipeline } from "../../src/dual-path-pipeline.js";

// Deliberately NOT scaled by stressScale for the long sweep: each instance allocates a full
// default 65,536-slot ring (~512 KB, the cost documented in the configuration guide's sizing
// section), so multiplying this count the way other stress scenarios multiply their volume
// stresses V8's array allocator, not this port's leak-prevention logic. "Thousands" already
// exercises the invariant; a fixed 2000 stays representative of the real per-request/per-click
// shape at both cadences.
const CONTEXTS = 2000;

/**
 * Thousands of short-lived, per-request-shaped contexts (stress mirror of the leak class the
 * buffered-consumer defaults work fixed 2026-08-31: an always-firing `setInterval` per instance
 * rooted every un-closed context, a GC root and a process keep-alive). `vi.getTimerCount()` is
 * the deterministic proxy for "no handle leaked" — a real `process.memoryUsage()` delta is at the
 * mercy of V8's GC schedule and would make this Tier-A gate test flaky; that class of check
 * belongs to the long randomized sweep (`pnpm run stress`), not the seeded subset every `check`
 * run pays for.
 */
describe("thousands of short-lived contexts leave no timer/handle behind (stress mirror of Java jcstress per-instance resource lifecycle)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Both tests carry an explicit 30s timeout: they assert an eventual property
  // over thousands of instances, and under coverage instrumentation in a
  // memory-capped CI container the default 5s vitest timeout is timing noise,
  // not a spec (it flaked exactly once, at 6.3s, in the containerized verify).
  test(`${CONTEXTS} closed request-shaped contexts: one timer per live consumer, zero once all close`, () => {
    const pipelines = Array.from({ length: CONTEXTS }, () => {
      const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
      const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
      ctx.enterMethod("Controller", "handle", []);
      ctx.exitMethodWithReturn('"ok"');
      return pipeline;
    });

    // Every context buffered an event and none has drained yet: exactly one timer per context,
    // not zero (a timer that never started) and not more (a timer restarted on top of itself).
    expect(vi.getTimerCount()).toBe(CONTEXTS);

    for (const pipeline of pipelines) pipeline.close();
    expect(vi.getTimerCount()).toBe(0);
  }, 30_000);

  test(`${CONTEXTS} request-shaped contexts nobody closes still self-stop once their drain empties`, () => {
    for (let i = 0; i < CONTEXTS; i++) {
      const pipeline = new DualPathPipeline(null, new BufferedEventConsumer());
      const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
      ctx.enterMethod("Controller", "handle", []);
      ctx.exitMethodWithReturn('"ok"');
      // Deliberately never closed and never referenced again — the forgotten-cleanup case a
      // per-request/per-click integration produces routinely.
    }

    expect(vi.getTimerCount()).toBe(CONTEXTS);
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(0);
  }, 30_000);
});
