// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import type { EventPipeline } from "../src/event-pipeline.js";
import { ForkJoinGroup } from "../src/fork-join-group.js";
import { renderIndentedText } from "../src/indented-text-renderer.js";
import { exportJson } from "../src/json-export.js";
import { renderMarkdown } from "../src/markdown-renderer.js";
import { renderProse } from "../src/prose-renderer.js";
import type { TraceNode } from "../src/trace-node.js";

/**
 * Java item 31's artifact rule: adopted work is tagged `async`, on the *first* span opened under an
 * activated snapshot and no deeper. Without the tag a structural artifact pins the scheduler's
 * dispatch order and no concurrent scenario can hold a stable baseline.
 */
describe("async concurrency tag", () => {
  let pipeline: EventPipeline;
  let context: SyncNarrativeContext;

  beforeEach(() => {
    pipeline = new DualPathPipeline(null, new BufferedEventConsumer(1024));
    context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
  });

  afterEach(() => pipeline.close());

  function workerContext(): SyncNarrativeContext {
    return new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
  }

  /** Runs `body` on a worker context under a snapshot of `context`, closing the scope after. */
  function underSnapshot(body: (worker: SyncNarrativeContext) => void, adopting = true): void {
    const snapshot = context.snapshot();
    const worker = workerContext();
    const scope = adopting ? snapshot.activate(worker) : snapshot.activateWithoutAdoption(worker);
    try {
      body(worker);
    } finally {
      scope.close();
    }
  }

  function findNode(nodes: readonly TraceNode[], methodName: string): TraceNode | undefined {
    for (const node of nodes) {
      if (node.signature.methodName === methodName) return node;
      const found = findNode(node.children, methodName);
      if (found) return found;
    }
    return undefined;
  }

  test("the first span opened under an activated snapshot is tagged async", () => {
    const launching = context.enterMethod("OrderService", "placeOrder", []);
    underSnapshot((worker) => {
      worker.enterMethod("NotificationService", "notifyOrderPlaced", []);
      worker.exitMethodWithReturn("true");
    });
    context.exitMethodWithReturn('"ORD-1"');

    const adopted = findNode(context.captureTrace().roots, "notifyOrderPlaced");

    expect(adopted?.concurrency?.kind).toBe("async");
    expect(adopted?.concurrency?.groupId).toBe(`async-${launching}`);
    expect(adopted?.concurrency?.taskLabel).toBe("NotificationService.notifyOrderPlaced");
  });

  test("everything deeper in the same scope is ordinary sequential work", () => {
    context.enterMethod("OrderService", "placeOrder", []);
    underSnapshot((worker) => {
      worker.enterMethod("NotificationService", "notifyOrderPlaced", []);
      worker.enterMethod("EmailGateway", "send", []);
      worker.exitMethodWithReturn("true");
      worker.exitMethodWithReturn("true");
    });
    context.exitMethodWithReturn('"ORD-1"');

    const roots = context.captureTrace().roots;

    expect(findNode(roots, "notifyOrderPlaced")?.concurrency?.kind).toBe("async");
    expect(findNode(roots, "send")?.concurrency).toBeUndefined();
  });

  test("every async child of one call shares the launching span's group", () => {
    const launching = context.enterMethod("OrderService", "placeOrder", []);
    underSnapshot((worker) => {
      worker.exitMethodWithReturn("true", worker.enterMethod("NotificationService", "email", []));
    });
    underSnapshot((worker) => {
      worker.exitMethodWithReturn("true", worker.enterMethod("NotificationService", "sms", []));
    });
    context.exitMethodWithReturn('"ORD-1"');

    const roots = context.captureTrace().roots;

    expect(findNode(roots, "email")?.concurrency?.groupId).toBe(`async-${launching}`);
    expect(findNode(roots, "sms")?.concurrency?.groupId).toBe(`async-${launching}`);
  });

  test("work propagated with no launching span is grouped per trace instead", () => {
    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn('"ORD-1"');
    underSnapshot((worker) => {
      worker.exitMethodWithReturn("true", worker.enterMethod("Notifier", "notify", []));
    });

    const tagged = findNode(context.captureTrace().roots, "notify");

    expect(tagged?.concurrency?.kind).toBe("async");
    expect(tagged?.concurrency?.groupId).toBe(`async-${context.currentTraceId}`);
  });

  test("a scope that opted out of adoption still crossed the boundary, so it is tagged", () => {
    // The tag belongs to capture, not to reporting: the worker's own trace must show it ran async
    // even when a helper, not the origin, is the one that will publish it.
    const worker = workerContext();
    context.enterMethod("OrderService", "placeOrder", []);
    const scope = context.snapshot().activateWithoutAdoption(worker);
    worker.exitMethodWithReturn("true", worker.enterMethod("Notifier", "notify", []));
    scope.close();
    context.exitMethodWithReturn('"ORD-1"');

    expect(findNode(worker.captureTrace().roots, "notify")?.concurrency?.kind).toBe("async");
  });

  test("a span opened without any snapshot carries no tag", () => {
    context.exitMethodWithReturn('"ORD-1"', context.enterMethod("OrderService", "placeOrder", []));

    expect(findNode(context.captureTrace().roots, "placeOrder")?.concurrency).toBeUndefined();
  });

  test("a fork group's own account of its members outranks the async tag", async () => {
    context.enterMethod("OrderService", "placeOrder", []);
    await ForkJoinGroup.all(context, [
      (forked) => {
        forked.enterMethod("InventoryService", "reserve", []);
        forked.exitMethodWithReturn("true");
      },
    ]);
    context.exitMethodWithReturn('"ORD-1"');

    expect(findNode(context.captureTrace().roots, "reserve")?.concurrency?.kind).toBe("fork-join");
  });

  test("the chapter-tree JSON carries the async kind", () => {
    context.enterMethod("OrderService", "placeOrder", []);
    underSnapshot((worker) => {
      worker.exitMethodWithReturn("true", worker.enterMethod("Notifier", "notify", []));
    });
    context.exitMethodWithReturn('"ORD-1"');

    const document = JSON.parse(exportJson(context.captureTrace(), { scenario: "places order" }));
    // The envelope carries concurrency on the exit event, where a fork group's tag already rides.
    const notify = document.events.find(
      (e: { methodName: string; type: string }) => e.methodName === "notify" && e.type === "exit",
    );

    expect(notify.concurrency.kind).toBe("async");
    expect(notify.concurrency.groupId).toMatch(/^async-/);
  });

  describe("rendering", () => {
    function treeWithTwoAsyncChildren() {
      context.enterMethod("OrderService", "placeOrder", []);
      underSnapshot((worker) => {
        worker.exitMethodWithReturn("true", worker.enterMethod("Notifier", "email", []));
      });
      underSnapshot((worker) => {
        worker.exitMethodWithReturn("true", worker.enterMethod("Notifier", "sms", []));
      });
      context.exitMethodWithReturn('"ORD-1"');
      return context.captureTrace();
    }

    test("markdown shows adopted work without claiming the caller forked and joined it", () => {
      const rendered = renderMarkdown(treeWithTwoAsyncChildren(), "places order");

      expect(rendered).toContain("email");
      expect(rendered).toContain("sms");
      expect(rendered).not.toContain("⑂ fork");
    });

    test("indented text shows adopted work without a fork block", () => {
      const rendered = renderIndentedText(treeWithTwoAsyncChildren());

      expect(rendered).toContain("email");
      expect(rendered).toContain("sms");
      expect(rendered).not.toContain("fork");
    });

    test("prose narrates adopted work as ordinary sentences", () => {
      const rendered = renderProse(treeWithTwoAsyncChildren());

      expect(rendered).not.toContain("Concurrently:");
      expect(rendered).toContain("The notifier emails");
    });
  });
});
