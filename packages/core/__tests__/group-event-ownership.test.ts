// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import { spanIdOf } from "../src/event-store-consumer.js";
import { ForkJoinGroup } from "../src/fork-join-group.js";
import type { TraceEvent } from "../src/trace-event.js";

// B-165: group lifecycle events belong to the request that launched them.

function newPipeline() {
  return new DualPathPipeline(null, new BufferedEventConsumer(256));
}

function newContext(pipeline: DualPathPipeline) {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
}

async function forkAndJoin(context: SyncNarrativeContext): Promise<void> {
  context.enterMethod("Service", "request", []);
  const group = ForkJoinGroup.create(context);
  group.fork((ctx) => {
    ctx.enterMethod("Worker", "task", []);
    ctx.exitMethodWithReturn('"ok"');
  });
  await group.join();
  context.exitMethodWithReturn('"done"');
}

const isGroupEvent = (e: TraceEvent) => e.type === "fork-created" || e.type === "join-complete";

describe("group event ownership (B-165)", () => {
  test("completed fork/join requests leave no group events in the store", async () => {
    const pipeline = newPipeline();
    for (let request = 0; request < 20; request++) {
      const context = newContext(pipeline);
      await forkAndJoin(context);
      context.reset();
    }
    pipeline.flush();

    expect(pipeline.events().filter(isGroupEvent)).toHaveLength(0);
  });

  test("every group event of one request answers the launching span", async () => {
    const pipeline = newPipeline();
    const context = newContext(pipeline);
    await forkAndJoin(context);
    pipeline.flush();

    const launching = pipeline.events().find((e) => e.type === "enter");
    const owners = pipeline.events().filter(isGroupEvent).map(spanIdOf);
    expect(owners.length).toBeGreaterThanOrEqual(2);
    for (const owner of owners)
      expect(owner).toBe((launching as { spanContext: { spanId: string } }).spanContext.spanId);
  });

  test("a capture holds its own request's group events and none of another request's", async () => {
    const pipeline = newPipeline();
    const a = newContext(pipeline);
    const b = newContext(pipeline);
    await forkAndJoin(a);
    await forkAndJoin(b);
    const spanOfA = a.captureTrace().roots[0]?.spanContext?.spanId;

    // The capture's own filter is private; observe it through the retained events of A's request.
    const ownedByA = pipeline
      .events()
      .filter(isGroupEvent)
      .filter((e) => spanIdOf(e) === spanOfA);
    const foreign = pipeline
      .events()
      .filter(isGroupEvent)
      .filter((e) => spanIdOf(e) !== spanOfA);
    expect(ownedByA).toHaveLength(2);
    expect(foreign).toHaveLength(2);
    const isOwned = (
      a as unknown as { isOwned(e: TraceEvent, s: Set<string>): boolean }
    ).isOwned.bind(a);
    const reportable = new Set([spanOfA as string]);
    expect(ownedByA.every((e) => isOwned(e, reportable))).toBe(true);
    expect(foreign.some((e) => isOwned(e, reportable))).toBe(false);
  });
});
