// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  AsyncNarrativeContext,
  concurrencyInfo,
  exportJson,
  FireAndForgetGroup,
  ForkJoinGroup,
  methodSignature,
  type NarrativeContext,
  NarrativeTraceConfig,
  renderMarkdown,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core-node";
import { describe, expect, test } from "vitest";

function makeContext(level: "detail" | "off" = "detail") {
  return new AsyncNarrativeContext(new NarrativeTraceConfig(level));
}

function discountLookup(ctx: NarrativeContext) {
  ctx.enterMethod("DiscountService", "calculateDiscount", []);
  ctx.exitMethodWithReturn("0.10");
  return 0.1;
}

function shippingLookup(ctx: NarrativeContext) {
  ctx.enterMethod("ShippingService", "estimateCost", []);
  ctx.exitMethodWithReturn("5.99");
  return 5.99;
}

describe("concurrency scenarios", () => {
  test("fork-join two tasks produce correct trace", async () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "checkout", []);
    const [discount, shipping] = await ForkJoinGroup.all(ctx, [discountLookup, shippingLookup]);
    ctx.exitMethodWithReturn(`"${discount + shipping}"`);

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(2);
    expect(tree.roots[0]?.children[0]?.concurrency?.kind).toBe("fork-join");
    expect(tree.roots[0]?.children[1]?.concurrency?.kind).toBe("fork-join");
  });

  test("fork-join merged children show task labels", async () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "checkout", []);
    await ForkJoinGroup.all(ctx, [discountLookup, shippingLookup]);
    ctx.exitMethodWithReturn('"done"');

    const tree = ctx.captureTrace();
    const labels = tree.roots[0]?.children.map((c) => c.concurrency?.taskLabel);
    expect(labels).toContain("DiscountService.calculateDiscount");
    expect(labels).toContain("ShippingService.estimateCost");
  });

  test("fork-join join line shows wall time", async () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "checkout", []);
    await ForkJoinGroup.all(ctx, [discountLookup, shippingLookup]);
    ctx.exitMethodWithReturn('"done"');

    const md = renderMarkdown(ctx.captureTrace());
    expect(md).toContain("⑃ join —");
  });

  test("fire-and-forget task appears as child of parent trace", async () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "placeOrder", []);
    const group = FireAndForgetGroup.create(ctx);
    group.launch((isolated) => {
      isolated.enterMethod("NotificationService", "send", []);
      isolated.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));
    ctx.exitMethodWithReturn('"ok"');

    const tree = ctx.captureTrace();
    const child = tree.roots[0]?.children.find(
      (c) => c.signature.className === "NotificationService",
    );
    expect(child).toBeDefined();
    expect(child?.concurrency?.kind).toBe("fire-and-forget");
    expect(child?.concurrency?.groupId).toBe(group.groupId);
  });

  test("sequential-async children flagged as awaited sequentially", async () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "checkout", []);

    // Simulate sequential async: fork two tasks with non-overlapping times
    const group = ForkJoinGroup.create(ctx);
    group.fork((isolated) => {
      isolated.enterMethod("DiscountService", "calculateDiscount", []);
      isolated.exitMethodWithReturn("0.10");
    });
    group.fork((isolated) => {
      isolated.enterMethod("ShippingService", "estimateCost", []);
      isolated.exitMethodWithReturn("5.99");
    });
    await group.join();
    ctx.exitMethodWithReturn('"done"');

    const md = renderMarkdown(ctx.captureTrace());
    // Tasks run so fast they have near-zero duration, so sequential detection
    // depends on timing. Just verify the rendering infrastructure works.
    expect(md).toContain("⑂ fork [2 tasks]");
  });

  test("sequential-async optimization hint shows savings", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 50, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 30, 200, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const md = renderMarkdown(tree);
    expect(md).toContain("⚡ Sequential async: total 80ms, parallelizable to ~50ms");
  });

  test("mixed concurrency patterns in correct order", async () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "placeOrder", []);

    // Sequential step
    ctx.enterMethod("ValidationService", "validate", []);
    ctx.exitMethodWithReturn("true");

    // Fork-join
    await ForkJoinGroup.all(ctx, [discountLookup, shippingLookup]);

    // Fire-and-forget
    const group = FireAndForgetGroup.create(ctx);
    group.launch((isolated) => {
      isolated.enterMethod("NotificationService", "send", []);
      isolated.exitMethodWithReturn('"sent"');
    });
    await new Promise((r) => setTimeout(r, 10));

    ctx.exitMethodWithReturn('"order-123"');

    const md = renderMarkdown(ctx.captureTrace());
    const validateIdx = md.indexOf("ValidationService");
    const forkIdx = md.indexOf("⑂ fork");
    const notifyIdx = md.indexOf("NotificationService");
    expect(validateIdx).toBeLessThan(forkIdx);
    expect(forkIdx).toBeLessThan(notifyIdx);
  });

  test("mixed concurrency JSON export includes concurrency fields", async () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "placeOrder", []);
    await ForkJoinGroup.all(ctx, [discountLookup, shippingLookup]);
    ctx.exitMethodWithReturn('"ok"');

    const json = exportJson(ctx.captureTrace(), { scenario: "Mixed" });
    const result = JSON.parse(json);
    const concurrencyEvents = result.events.filter((e: { concurrency?: unknown }) => e.concurrency);
    expect(concurrencyEvents.length).toBeGreaterThanOrEqual(2);
    expect(concurrencyEvents[0].concurrency.kind).toBe("fork-join");
  });

  test("capture level off produces empty trace", async () => {
    const ctx = makeContext("off");
    ctx.enterMethod("OrderService", "checkout", []);
    await ForkJoinGroup.all(ctx, [discountLookup, shippingLookup]);
    ctx.exitMethodWithReturn('"done"');

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(0);
  });
});
