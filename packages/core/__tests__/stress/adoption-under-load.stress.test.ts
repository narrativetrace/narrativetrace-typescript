// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../../src/config.js";
import { SyncNarrativeContext } from "../../src/context.js";
import { DualPathPipeline } from "../../src/dual-path-pipeline.js";
import type { EventPipeline } from "../../src/event-pipeline.js";
import type { SpanId } from "../../src/span-id-generator.js";
import { countNodes, mulberry32, randomYield } from "./stress-helpers.js";
import { stressScale } from "./stress-scale.js";

function contextOn(pipeline: EventPipeline): SyncNarrativeContext {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
}

/**
 * Activates a snapshot of `origin` in a fresh worker context, does one span of randomly-timed
 * work, then closes the scope at a randomly-timed moment — the hand-over path exercised by
 * `context.ts`'s `adoptingScope`/`handOver` (register live, then on close: adopt, then
 * unregister — "so a capture racing the close sees the work through one route or the other,
 * never neither").
 */
async function runAdoptingWorker(
  origin: SyncNarrativeContext,
  pipeline: EventPipeline,
  i: number,
  rand: () => number,
): Promise<void> {
  const snapshot = origin.snapshot();
  const worker = contextOn(pipeline);
  const scope = snapshot.activate(worker);
  try {
    await randomYield(rand);
    worker.enterMethod("Worker", `task${i}`, []);
    await randomYield(rand);
    worker.exitMethodWithReturn(`"${i}"`);
    await randomYield(rand);
  } finally {
    scope.close();
  }
}

describe("adoption under interleaved async scopes (stress mirror of Java jcstress LiveChildHandOverTest)", () => {
  test("workers activating/closing snapshots at random times: zero loss", async () => {
    const { seed, scale } = stressScale(424242);
    const rand = mulberry32(seed);
    const WORKERS = scale(300);
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1 << 16));
    const origin = contextOn(pipeline);
    origin.enterMethod("Orchestrator", "fanOut", []);

    const workers = Array.from({ length: WORKERS }, (_, i) =>
      runAdoptingWorker(origin, pipeline, i, rand),
    );
    await Promise.all(workers);
    origin.exitMethodWithReturn('"done"');

    const tree = origin.captureTrace();
    const loss = origin.traceLoss();

    // 1 orchestrator root plus one adopted child per worker — every hand-over accounted for,
    // none stranded in the live registry and none double-reported.
    expect(countNodes(tree.roots)).toBe(WORKERS + 1);
    expect(loss.droppedEvents).toBe(0);
    expect(loss.refusedScopes).toBe(0);
    expect(loss.refusedSpans).toBe(0);
    expect(loss.discardedSpans).toBe(0);

    pipeline.close();
  });
});

function spanIds(startAt: number, count: number): Set<SpanId> {
  const ids = new Set<SpanId>();
  for (let i = 0; i < count; i++) {
    ids.add((startAt + i).toString(16).padStart(16, "0") as SpanId);
  }
  return ids;
}

describe("adoption ceiling refuses a batch whole, never a partial one (stress mirror of Java jcstress AdoptionCeilingTest)", () => {
  test("a batch that would cross the ceiling changes nothing; one that fits is adopted whole", () => {
    const stress = stressScale(20260901);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (ceiling, already, batchSize) => {
          const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1024));
          const ctx = new SyncNarrativeContext(
            new NarrativeTraceConfig("detail"),
            undefined,
            pipeline,
            null,
            undefined,
            undefined,
            ceiling,
          );
          if (already > 0) ctx.adopt(spanIds(0, already));
          const before = ctx.adoptedSpans().size;

          ctx.adopt(spanIds(10_000, batchSize));
          const after = ctx.adoptedSpans().size;

          if (before + batchSize > ceiling) {
            expect(after).toBe(before);
            expect(ctx.refusedSpanCount()).toBeGreaterThanOrEqual(batchSize);
          } else {
            expect(after).toBe(before + batchSize);
          }
          pipeline.close();
        },
      ),
      { numRuns: stress.scale(100), seed: stress.seed },
    );
  });
});
