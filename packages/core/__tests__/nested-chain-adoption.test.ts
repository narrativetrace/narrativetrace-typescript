// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";
import type { TraceNode } from "../src/trace-node.js";
import type { TraceTree } from "../src/trace-tree.js";

/** A promise plus its resolver — how a scope is held open at an exact instant, without a timer. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * The nested chain: origin → worker → grandchild, where the worker activates a snapshot of its own
 * context. Mirrors Java's `NestedChainAdoptionTest`.
 *
 * Adoption and live visibility used to hand over a child's *own* spans only, so a grandchild's call
 * reached the worker and stopped there — and the origin, whose request this all is and the only
 * context anyone captures on, never saw it. Two async hops is not exotic: a controller dispatches to
 * a service that dispatches to a client.
 *
 * Three deferreds, no timers. The grandchild publishes and waits before closing its scope; the
 * worker waits before closing its own. That holds the chain at each of the three instants that
 * matter — all scopes open, the grandchild closed, everything closed — and the same tree is asserted
 * at all three, so a call that appears and then vanishes (or is counted twice) fails.
 */
describe("nested chain adoption", () => {
  let pipeline: EventPipeline;
  let context: SyncNarrativeContext;
  let chain: Chain | undefined;

  beforeEach(() => {
    pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1024));
    context = contextOn(pipeline);
  });

  afterEach(async () => {
    await chain?.releaseEverything();
    chain = undefined;
    pipeline.close();
  });

  function contextOn(target: EventPipeline, maxAdoptedSpans?: number): SyncNarrativeContext {
    return new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      target,
      null,
      undefined,
      undefined,
      maxAdoptedSpans,
    );
  }

  interface ChainOptions {
    readonly workerAdopts?: boolean;
    readonly grandchildAdopts?: boolean;
  }

  /**
   * Two asynchronous scopes held open by deferreds: the worker activates a snapshot of the origin,
   * the grandchild a snapshot of the worker. Each publishes its call and then waits, so the test
   * decides which scopes are open at the moment it captures.
   */
  class Chain {
    private readonly releaseWorker = deferred();
    private readonly releaseGrandchild = deferred();
    private readonly published = deferred();
    private workerFinished: Promise<void> = Promise.resolve();
    private grandchildFinished: Promise<void> = Promise.resolve();

    constructor(private readonly options: ChainOptions = {}) {}

    /** Traces the origin call, launches the chain, and returns once the grandchild published. */
    async startFrom(origin: SyncNarrativeContext): Promise<void> {
      origin.enterMethod("OrderService", "placeOrder", []);
      const snapshot = origin.snapshot();
      origin.exitMethodWithReturn('"ORD-1"');
      this.workerFinished = this.runWorker(snapshot);
      await this.published.promise;
    }

    // Deliberately does *not* await its grandchild before closing: a worker whose own scope ends
    // while its child is still running is the ordering a framework actually produces, and it is the
    // ordering that decides whether hand-over carries the whole chain.
    private async runWorker(snapshot: ReturnType<SyncNarrativeContext["snapshot"]>): Promise<void> {
      const worker = contextOn(pipeline);
      const scope =
        this.options.workerAdopts === false
          ? snapshot.activateWithoutAdoption(worker)
          : snapshot.activate(worker);
      try {
        worker.enterMethod("NotificationService", "notifyOrderPlaced", []);
        const nested = worker.snapshot();
        worker.exitMethodWithReturn("true");
        this.grandchildFinished = this.runGrandchild(nested);
        await this.releaseWorker.promise;
      } finally {
        scope.close();
      }
    }

    private async runGrandchild(
      snapshot: ReturnType<SyncNarrativeContext["snapshot"]>,
    ): Promise<void> {
      const grandchild = contextOn(pipeline);
      const scope =
        this.options.grandchildAdopts === false
          ? snapshot.activateWithoutAdoption(grandchild)
          : snapshot.activate(grandchild);
      try {
        grandchild.enterMethod("EmailGateway", "send", []);
        grandchild.exitMethodWithReturn("true");
        this.published.resolve();
        await this.releaseGrandchild.promise;
      } finally {
        scope.close();
      }
    }

    async closeGrandchild(): Promise<void> {
      this.releaseGrandchild.resolve();
      await this.grandchildFinished;
    }

    async closeWorker(): Promise<void> {
      this.releaseWorker.resolve();
      await this.workerFinished;
    }

    async releaseEverything(): Promise<void> {
      this.releaseGrandchild.resolve();
      this.releaseWorker.resolve();
      await this.grandchildFinished;
      await this.workerFinished;
    }
  }

  async function start(options?: ChainOptions): Promise<Chain> {
    chain = new Chain(options);
    await chain.startFrom(context);
    return chain;
  }

  function methodNames(tree: TraceTree): string[] {
    const names: string[] = [];
    const walk = (nodes: readonly TraceNode[]): void => {
      for (const node of nodes) {
        names.push(node.signature.methodName);
        walk(node.children);
      }
    };
    walk(tree.roots);
    return names;
  }

  const WHOLE_CHAIN = ["placeOrder", "notifyOrderPlaced", "send"];

  test("the grandchild's call is visible to the origin while every scope is still open", async () => {
    await start();

    // Two async hops from the origin is still the origin's request.
    expect(methodNames(context.captureTrace())).toEqual(WHOLE_CHAIN);
  });

  test("the grandchild's call stays visible once its own scope closes", async () => {
    const running = await start();

    await running.closeGrandchild();

    // The worker adopted it; the origin must see it through the worker either way.
    expect(methodNames(context.captureTrace())).toEqual(WHOLE_CHAIN);
  });

  test("the grandchild's call stays visible once every scope closes", async () => {
    const running = await start();

    await running.closeGrandchild();
    await running.closeWorker();

    // Hand-over must carry what the child adopted, not only what it created.
    expect(methodNames(context.captureTrace())).toEqual(WHOLE_CHAIN);
  });

  test("the worker closing before its grandchild still hands the grandchild over", async () => {
    const running = await start();

    await running.closeWorker();

    expect(methodNames(context.captureTrace())).toEqual(WHOLE_CHAIN);

    await running.closeGrandchild();

    // Nothing may appear twice once the late grandchild finishes.
    expect(methodNames(context.captureTrace())).toEqual(WHOLE_CHAIN);
  });

  test("the calls nest origin to worker to grandchild", async () => {
    const running = await start();
    await running.closeGrandchild();
    await running.closeWorker();

    const tree = context.captureTrace();

    expect(tree.roots).toHaveLength(1);
    const origin = tree.roots[0];
    expect(origin?.signature.methodName).toBe("placeOrder");
    expect(origin?.children).toHaveLength(1);
    const worker = origin?.children[0];
    expect(worker?.signature.methodName).toBe("notifyOrderPlaced");
    expect(worker?.children).toHaveLength(1);
    expect(worker?.children[0]?.signature.methodName).toBe("send");
  });

  test("every call in the chain carries the origin's trace id", async () => {
    const running = await start();
    await running.closeGrandchild();
    await running.closeWorker();

    const traceIds: (string | undefined)[] = [];
    const walk = (nodes: readonly TraceNode[]): void => {
      for (const node of nodes) {
        traceIds.push(node.spanContext?.traceId);
        walk(node.children);
      }
    };
    walk(context.captureTrace().roots);

    expect(traceIds).toHaveLength(3);
    expect(new Set(traceIds).size).toBe(1);
    expect(traceIds[0]).toBe(context.currentTraceId);
  });

  test("a grandchild behind a non-adopting worker reaches neither the worker nor the origin", async () => {
    const running = await start({ workerAdopts: false });

    // The worker publishes its own children; its subtree must not be counted twice.
    expect(methodNames(context.captureTrace())).toEqual(["placeOrder"]);

    await running.closeGrandchild();
    await running.closeWorker();

    expect(methodNames(context.captureTrace())).toEqual(["placeOrder"]);
  });

  test("a grandchild activated without adoption stays out of the origin's trace", async () => {
    const running = await start({ grandchildAdopts: false });

    expect(methodNames(context.captureTrace())).toEqual(["placeOrder", "notifyOrderPlaced"]);

    await running.closeGrandchild();
    await running.closeWorker();

    // What the child never joined, it cannot hand over.
    expect(methodNames(context.captureTrace())).toEqual(["placeOrder", "notifyOrderPlaced"]);
  });

  test("a whole chain that crosses the origin's ceiling is refused entire and counted", async () => {
    context = contextOn(pipeline, 1);
    const running = await start();

    // While the scopes are open the chain is visible through the live registry: the ceiling bounds
    // what is *taken over*, not what a live child can answer for.
    expect(methodNames(context.captureTrace())).toEqual(WHOLE_CHAIN);

    await running.closeGrandchild();
    await running.closeWorker();

    // Two spans arrive as one batch against a ceiling of one: refused whole rather than stranding
    // `send` under a `notifyOrderPlaced` that stayed out.
    expect(methodNames(context.captureTrace())).toEqual(["placeOrder"]);
    expect(context.traceLoss().refusedScopes).toBe(1);
    expect(context.traceLoss().refusedSpans).toBe(2);
  });
});
