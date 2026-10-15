// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  FireAndForgetGroup,
  ForkJoinGroup,
  NarrativeTraceConfig,
  type TraceNode,
  type TraceTree,
} from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import { describe, expect, test } from "vitest";
import { AsyncNarrativeContext } from "../src/index.js";

// Parity check C8 (2026-10-11): the trace continues across an async handover by the documented
// mechanism — README "Concurrency": ForkJoinGroup.all for parallel work, FireAndForgetGroup for
// background work, each task handed its own context. Checkout shape: reserve inventory and charge
// payment in parallel, notify in the background.
class Inventory {
  async reserve(_sku: string, _quantity: number): Promise<boolean> {
    await Promise.resolve();
    return true;
  }
}
class Payments {
  async charge(_orderId: string, _amount: number): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return "tx-1";
  }
}
class Notifier {
  async sendReceipt(_orderId: string): Promise<void> {
    await Promise.resolve();
  }
}

function flatten(nodes: readonly TraceNode[]): TraceNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

async function placeOrder(context: AsyncNarrativeContext): Promise<void> {
  const handle = context.enterMethod("OrderService", "placeOrder", []);
  await ForkJoinGroup.all(context, [
    (ctx) => traceObject(new Inventory(), ctx, { reserve: ["sku", "quantity"] }).reserve("P1", 2),
    (ctx) => traceObject(new Payments(), ctx, { charge: ["orderId", "amount"] }).charge("O1", 20),
  ]);
  FireAndForgetGroup.create(context).launch((ctx) =>
    traceObject(new Notifier(), ctx, { sendReceipt: ["orderId"] }).sendReceipt("O1"),
  );
  await new Promise((resolve) => setImmediate(resolve)); // the detached receipt settles first
  context.exitMethodWithReturn('"O1"', handle);
}

function checkoutTrace(context: AsyncNarrativeContext): Promise<TraceTree> {
  return context.run(async () => {
    await placeOrder(context);
    return context.captureTrace();
  });
}

describe("the checkout trace continues across async handovers", () => {
  // Parity check 2026-10-11, capability C8: the fork/join and fire-and-forget children read the
  // launching call's trace id through AsyncNarrativeContext.currentTraceId — without it they
  // minted a fresh one each, while SyncNarrativeContext inherited it.
  test("every call made through a fork/join and a fire-and-forget stays on one trace id", async () => {
    const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const calls = flatten((await checkoutTrace(context)).roots);

    const names = calls.map((n) => `${n.signature.className}.${n.signature.methodName}`);
    expect(names).toHaveLength(4);
    expect(names).toEqual(
      expect.arrayContaining([
        "OrderService.placeOrder",
        "Inventory.reserve",
        "Payments.charge",
        "Notifier.sendReceipt",
      ]),
    );
    expect(new Set(calls.map((n) => n.spanContext?.traceId)).size).toBe(1);
  });

  test("the handed-over calls nest under the call that launched them, tagged by mechanism", async () => {
    const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await checkoutTrace(context);

    const order = tree.roots[0];
    expect(order?.signature.methodName).toBe("placeOrder");
    const kinds = new Map(
      (order?.children ?? []).map((c) => [c.signature.methodName, c.concurrency?.kind]),
    );
    expect(kinds.get("reserve")).toBe("fork-join");
    expect(kinds.get("charge")).toBe("fork-join");
    expect(kinds.get("sendReceipt")).toBe("fire-and-forget");
  });

  test("two concurrent checkouts never take each other's handed-over calls", async () => {
    const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const [first, second] = await Promise.all([checkoutTrace(context), checkoutTrace(context)]);

    expect(flatten(first.roots)).toHaveLength(4);
    expect(flatten(second.roots)).toHaveLength(4);
    expect(first.roots[0]?.spanContext?.traceId).not.toBe(second.roots[0]?.spanContext?.traceId);
  });
});
