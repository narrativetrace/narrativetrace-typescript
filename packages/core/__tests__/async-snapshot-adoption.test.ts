// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";
import { FireAndForgetGroup } from "../src/fire-and-forget-group.js";
import { ForkJoinGroup } from "../src/fork-join-group.js";
import type { TraceNode } from "../src/trace-node.js";
import type { TraceTree } from "../src/trace-tree.js";

/**
 * Work traced under a propagated snapshot belongs to the trace that launched it: the synchronous log
 * stream already narrates it, so the captured tree must not silently lose it. Mirrors Java's
 * `AsyncSnapshotAdoptionTest` and `LiveSnapshotScopeVisibilityTest`.
 *
 * The live-visibility half is pinned with an explicit deferred rather than a timer: an async worker
 * that has published its call and is awaiting *before* its scope closes is the exact window the race
 * lives in, and a timer would only make the window likely rather than certain.
 */
describe("async snapshot adoption", () => {
  let pipeline: EventPipeline;
  let context: SyncNarrativeContext;

  beforeEach(() => {
    pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1024));
    context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
  });

  afterEach(() => pipeline.close());

  /** A worker context: the analogue of the thread a snapshot is activated on. */
  function workerContext(): SyncNarrativeContext {
    return new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
  }

  function traceCall(target: SyncNarrativeContext, className: string, methodName: string): void {
    target.enterMethod(className, methodName, []);
    target.exitMethodWithReturn("true");
  }

  /** Runs one traced call under the snapshot on a worker context and closes the scope. */
  async function runUnderSnapshot(body: (worker: SyncNarrativeContext) => void): Promise<void> {
    const snapshot = context.snapshot();
    const worker = workerContext();
    const scope = snapshot.activate(worker);
    try {
      await Promise.resolve();
      body(worker);
    } finally {
      scope.close();
    }
  }

  /**
   * Drains the microtask queue. A fire-and-forget group publishes its children in a promise
   * continuation, so the assertion has to stand behind the continuations, not a timer.
   */
  async function drainMicrotasks(): Promise<void> {
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
  }

  function names(nodes: readonly TraceNode[]): string[] {
    return nodes.map((n) => `${n.signature.className}.${n.signature.methodName}`);
  }

  function methodNames(tree: TraceTree): string[] {
    const collected: string[] = [];
    const walk = (nodes: readonly TraceNode[]): void => {
      for (const node of nodes) {
        collected.push(node.signature.methodName);
        walk(node.children);
      }
    };
    walk(tree.roots);
    return collected;
  }

  test("async work started after the parent returned becomes a second root", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn('"OrderResult"');
    await runUnderSnapshot((worker) =>
      traceCall(worker, "NotificationService", "notifyOrderPlaced"),
    );

    const roots = context.captureTrace().roots;

    expect(names(roots)).toEqual([
      "OrderService.placeOrder",
      "NotificationService.notifyOrderPlaced",
    ]);
  });

  test("async work started inside the parent becomes a child", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    await runUnderSnapshot((worker) =>
      traceCall(worker, "NotificationService", "notifyOrderPlaced"),
    );
    context.exitMethodWithReturn('"OrderResult"');

    const roots = context.captureTrace().roots;

    expect(names(roots)).toEqual(["OrderService.placeOrder"]);
    expect(names(roots[0]?.children ?? [])).toEqual(["NotificationService.notifyOrderPlaced"]);
  });

  test("nested async calls keep their own shape", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    await runUnderSnapshot((worker) => {
      worker.enterMethod("NotificationService", "notifyOrderPlaced", []);
      worker.enterMethod("EmailGateway", "send", []);
      worker.exitMethodWithReturn("true");
      worker.exitMethodWithReturn("true");
    });
    context.exitMethodWithReturn('"OrderResult"');

    const root = context.captureTrace().roots[0];

    expect(names(root?.children ?? [])).toEqual(["NotificationService.notifyOrderPlaced"]);
    expect(names(root?.children[0]?.children ?? [])).toEqual(["EmailGateway.send"]);
  });

  test("work on a context that never activated the snapshot stays out", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn('"OrderResult"');
    const unrelated = workerContext();
    await Promise.resolve();
    traceCall(unrelated, "Unrelated", "backgroundSweep");

    expect(names(context.captureTrace().roots)).toEqual(["OrderService.placeOrder"]);
  });

  test("adoption dies with the context that took the snapshot", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn('"OrderResult"');
    const snapshot = context.snapshot();
    context.reset();

    const worker = workerContext();
    const scope = snapshot.activate(worker);
    await Promise.resolve();
    traceCall(worker, "NotificationService", "notifyOrderPlaced");
    scope.close();

    expect(context.captureTrace().roots).toEqual([]);
  });

  // Bug-hunt no-poison contract: a worker that finishes and tries to hand
  // over AFTER its origin reset used to be silently retained forever (adoption skipped, but the
  // events stayed in the shared pipeline and nothing counted the loss). It must now be discarded
  // AND counted — a lifecycle question ("has this request ended"), not a GC-liveness one.
  test("late completion after reset is discarded from the pipeline and counted as loss", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn('"OrderResult"');
    const snapshot = context.snapshot();
    context.reset();

    const worker = workerContext();
    const scope = snapshot.activate(worker);
    await Promise.resolve();
    traceCall(worker, "NotificationService", "notifyOrderPlaced");
    scope.close();

    pipeline.flush();
    expect(pipeline.events()).toHaveLength(0);
    expect(context.traceLoss().discardedSpans).toBe(1);
  });

  test("fork group children are not counted twice", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    await ForkJoinGroup.all(context, [
      (forked) => {
        forked.enterMethod("InventoryService", "reserve", []);
        forked.exitMethodWithReturn("true");
      },
    ]);
    context.exitMethodWithReturn('"OrderResult"');

    const root = context.captureTrace().roots[0];

    expect(names(root?.children ?? [])).toEqual(["InventoryService.reserve"]);
  });

  test("fire-and-forget children are not counted twice", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(context);
    let settled!: () => void;
    const done = new Promise<void>((resolve) => {
      settled = resolve;
    });
    group.launch(async (detached) => {
      detached.enterMethod("AuditService", "record", []);
      detached.exitMethodWithReturn("true");
      settled();
    });
    await done;
    await drainMicrotasks();
    context.exitMethodWithReturn('"OrderResult"');

    const root = context.captureTrace().roots[0];

    expect(names(root?.children ?? [])).toEqual(["AuditService.record"]);
  });

  test("a fire-and-forget task that rejects still publishes its children", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(context);
    group.launch(async (detached) => {
      detached.enterMethod("AuditService", "record", []);
      detached.exitMethodWithException(new Error("sink unavailable"));
      throw new Error("sink unavailable");
    });
    await drainMicrotasks();
    context.exitMethodWithReturn('"OrderResult"');

    const root = context.captureTrace().roots[0];

    expect(names(root?.children ?? [])).toEqual(["AuditService.record"]);
  });

  test("many async children all land in the tree", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    for (let i = 0; i < 50; i++) {
      await runUnderSnapshot((worker) => traceCall(worker, "NotificationService", `notify${i}`));
    }
    context.exitMethodWithReturn('"OrderResult"');

    expect(context.captureTrace().roots[0]?.children).toHaveLength(50);
  });

  describe("live scope visibility", () => {
    /** A worker that publishes its call and then awaits, its scope deliberately still open. */
    function workerHoldingItsScopeOpen(adopting = true): {
      published: Promise<void>;
      release: () => void;
      finished: Promise<void>;
    } {
      const snapshot = context.snapshot();
      const worker = workerContext();
      let announcePublished!: () => void;
      let release!: () => void;
      const published = new Promise<void>((resolve) => {
        announcePublished = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const finished = (async () => {
        const scope = adopting
          ? snapshot.activate(worker)
          : snapshot.activateWithoutAdoption(worker);
        try {
          traceCall(worker, "NotificationService", "notifyOrderPlaced");
          announcePublished();
          await held;
        } finally {
          scope.close();
        }
      })();
      return { published, release, finished };
    }

    test("the worker's call is visible to the origin while the scope is still open", async () => {
      context.enterMethod("OrderService", "placeOrder", []);
      const worker = workerHoldingItsScopeOpen();
      context.exitMethodWithReturn('"ORD-1"');
      await worker.published;

      // The caller observed the worker's completion, so its trace must already show it.
      expect(methodNames(context.captureTrace())).toEqual(["placeOrder", "notifyOrderPlaced"]);

      worker.release();
      await worker.finished;

      // Scope close adopts the same spans — it must not add a second copy of them.
      expect(methodNames(context.captureTrace())).toEqual(["placeOrder", "notifyOrderPlaced"]);
    });

    test("the worker's call nests under the caller while the scope is still open", async () => {
      context.enterMethod("OrderService", "placeOrder", []);
      const worker = workerHoldingItsScopeOpen();
      context.exitMethodWithReturn('"ORD-1"');
      await worker.published;

      const tree = context.captureTrace();

      expect(tree.roots).toHaveLength(1);
      expect(tree.roots[0]?.signature.methodName).toBe("placeOrder");
      expect(names(tree.roots[0]?.children ?? [])).toEqual([
        "NotificationService.notifyOrderPlaced",
      ]);

      worker.release();
      await worker.finished;
    });

    test("a scope activated without adoption stays out of the origin's trace, open or closed", async () => {
      context.enterMethod("OrderService", "placeOrder", []);
      const worker = workerHoldingItsScopeOpen(false);
      context.exitMethodWithReturn('"ORD-1"');
      await worker.published;

      // Helpers that publish their own children must not have them counted twice.
      expect(methodNames(context.captureTrace())).toEqual(["placeOrder"]);

      worker.release();
      await worker.finished;

      expect(methodNames(context.captureTrace())).toEqual(["placeOrder"]);
    });

    test("closing the scope ends the live registration", async () => {
      context.enterMethod("OrderService", "placeOrder", []);
      context.exitMethodWithReturn('"ORD-1"');
      await runUnderSnapshot((worker) =>
        traceCall(worker, "NotificationService", "notifyOrderPlaced"),
      );

      // A finished worker must not stay pinned to the origin for the rest of its life…
      expect(context.liveChildSpanIds()).toEqual(new Set());
      // …because adoption has taken the same spans over, so nothing is lost by unregistering.
      expect(methodNames(context.captureTrace())).toEqual(["placeOrder", "notifyOrderPlaced"]);
    });

    test("the worker's call survives the loss of its context", async () => {
      context.enterMethod("OrderService", "placeOrder", []);
      context.exitMethodWithReturn('"ORD-1"');
      await runUnderSnapshot((worker) =>
        traceCall(worker, "NotificationService", "notifyOrderPlaced"),
      );

      // The registry holds the child weakly, so only adoption makes the visibility permanent: the
      // worker context is unreachable from here and the call is still reported.
      expect(methodNames(context.captureTrace())).toEqual(["placeOrder", "notifyOrderPlaced"]);
    });

    test("a snapshot whose origin is gone is silent at activation and at close", async () => {
      context.enterMethod("OrderService", "placeOrder", []);
      context.exitMethodWithReturn('"ORD-1"');
      const snapshot = context.snapshot();
      context.reset();

      const worker = workerContext();
      const scope = snapshot.activate(worker);
      await Promise.resolve();
      traceCall(worker, "NotificationService", "notifyOrderPlaced");
      scope.close();

      expect(context.captureTrace().roots).toEqual([]);
      expect(context.liveChildSpanIds()).toEqual(new Set());
    });
  });
});
