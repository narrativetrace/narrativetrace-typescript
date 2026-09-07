// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  exportJson,
  FireAndForgetGroup,
  ForkJoinGroup,
  type TraceNode,
} from "@narrativetrace/core";
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { describe, expect, test } from "vitest";
import { InMemoryCatalogService } from "../src/catalog-service.js";
import { InMemoryInventoryService } from "../src/inventory-service.js";
import { StubNotificationService } from "../src/notification-service.js";

/**
 * Characterization of the concurrency demo the README shows: pricing + stock run in parallel under a
 * ForkJoinGroup, and an order-placed notification is fire-and-forget. Asserts the trace records the
 * shared groupId, fork-join kind, and the fanf launcher — plus the JSON concurrency fields.
 */
async function runCheckout() {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
  ctx.enterMethod("CheckoutController", "checkout", []);

  const [price, reservation] = await ForkJoinGroup.all(ctx, [
    (fctx) =>
      traceObject(new InMemoryCatalogService(), fctx, undefined, {
        className: "CatalogService",
      }).lookupPrice("P1"),
    (fctx) =>
      traceObject(new InMemoryInventoryService(), fctx, undefined, {
        className: "InventoryService",
      }).reserve("P1", 1),
  ]);

  const background = FireAndForgetGroup.create(ctx);
  background.launch(async (fctx) => {
    await traceObject(new StubNotificationService(), fctx, undefined, {
      className: "NotificationService",
    }).notifyOrderPlaced("C1", "O1");
  });
  // Let the fire-and-forget task settle so its span is captured.
  await new Promise((resolve) => setTimeout(resolve, 10));

  ctx.exitMethodWithReturn('"placed"');
  return { tree: ctx.captureTrace(), price, reservation };
}

function flatten(nodes: readonly TraceNode[]): TraceNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

describe("ecommerce concurrency", () => {
  test("fork-join pricing + stock run under one shared group", async () => {
    const { tree, price, reservation } = await runCheckout();

    expect(price).toBe(29.99);
    expect(reservation).toEqual({ productId: "P1", quantity: 1 });

    const forkMembers = flatten(tree.roots).filter((n) => n.concurrency?.kind === "fork-join");
    const names = forkMembers.map((n) => n.signature.methodName).sort();
    expect(names).toStrictEqual(["lookupPrice", "reserve"]);

    const groupIds = new Set(forkMembers.map((n) => n.concurrency?.groupId));
    expect(groupIds.size).toBe(1);
  });

  test("the notification is launched fire-and-forget and captured", async () => {
    const { tree } = await runCheckout();
    const fanf = flatten(tree.roots).find((n) => n.concurrency?.kind === "fire-and-forget");
    expect(fanf?.signature.className).toBe("NotificationService");
  });

  test("JSON export carries the concurrency fields", async () => {
    const { tree } = await runCheckout();
    const json = JSON.parse(exportJson(tree, { scenario: "checkout" }));
    const withConcurrency = JSON.stringify(json).includes('"groupId"');
    expect(withConcurrency).toBe(true);
    expect(JSON.stringify(json)).toContain('"kind":"fork-join"');
  });
});
