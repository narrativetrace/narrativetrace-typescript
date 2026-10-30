// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import type { ContextScope } from "../src/context-snapshot.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";

/**
 * B-198 (TypeScript twin of Java's `DeepLiveChildChainDepthTest`): a worker that holds many async
 * scopes open, each activated from a snapshot of the one before, builds a chain of live children.
 * Reading the chain recursed once per link with no bound, so the origin's own `captureTrace()`
 * overflowed the stack. The chain is capped in depth at registration (`MAX_LIVE_CHILD_DEPTH`).
 */
describe("B-198: a deep chain of open async scopes", () => {
  let pipeline: EventPipeline;

  beforeEach(() => {
    pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1 << 16));
  });

  afterEach(() => pipeline.close());

  const context = (): SyncNarrativeContext =>
    new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);

  /** Opens `links` nested scopes, each on a fresh context activated from the previous one's snapshot. */
  function openChain(origin: SyncNarrativeContext, links: number, callEach = false) {
    const scopes: ContextScope[] = [];
    let from = origin;
    for (let i = 0; i < links; i++) {
      const next = context();
      scopes.push(from.snapshot().activate(next));
      if (callEach) {
        next.enterMethod("Worker", "step", []);
        next.exitMethodWithReturn(null);
      }
      from = next;
    }
    return scopes;
  }

  const steps = (origin: SyncNarrativeContext): number => {
    let n = 0;
    const walk = (
      nodes: readonly { signature: { methodName: string }; children: readonly unknown[] }[],
    ): void => {
      for (const node of nodes) {
        if (node.signature.methodName === "step") n += 1;
        walk(node.children as never);
      }
    };
    walk(origin.captureTrace().roots as never);
    return n;
  };

  test("the origin captures its own trace with thousands of scopes open", () => {
    const origin = context();
    origin.enterMethod("Origin", "call", []);
    const scopes = openChain(origin, 5_000);

    expect(() => origin.captureTrace()).not.toThrow();

    for (let i = scopes.length - 1; i >= 0; i--) scopes[i]?.close();
  });

  test("closing a deep chain oldest-first does not overflow the worker", () => {
    const origin = context();
    origin.enterMethod("Origin", "call", []);
    const scopes = openChain(origin, 5_000);

    expect(() =>
      scopes.forEach((s) => {
        s.close();
      }),
    ).not.toThrow();
  });

  test("resetting the origin under a deep chain does not overflow", () => {
    const origin = context();
    origin.enterMethod("Origin", "call", []);
    const scopes = openChain(origin, 5_000);

    expect(() => origin.reset()).not.toThrow();
    expect(() =>
      scopes.forEach((s) => {
        s.close();
      }),
    ).not.toThrow();
  });

  test("work past the depth cap is invisible while open and handed over whole at close", () => {
    const cap = SyncNarrativeContext.MAX_LIVE_CHILD_DEPTH;
    const links = cap + 1;
    const origin = context();
    origin.enterMethod("Origin", "call", []);
    const scopes = openChain(origin, links, true);

    expect(steps(origin), "the link past the cap is not visible while open").toBe(links - 1);

    for (let i = scopes.length - 1; i >= 0; i--) scopes[i]?.close();

    expect(steps(origin), "and arrives whole at close").toBe(links);
  });
});
