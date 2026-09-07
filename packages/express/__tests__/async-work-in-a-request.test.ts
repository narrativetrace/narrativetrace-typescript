// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { LogContext } from "@narrativetrace/observability";
import { traceObject } from "@narrativetrace/proxy";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";
import { narrativeTrace } from "../src/narrative-trace-middleware.js";

afterEach(() => LogContext.reset());

/** A promise plus its resolver, so a background task can be held in flight without a timer. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

class OrderService {
  placeOrder(customerId: string): string {
    return `ORD-${customerId}`;
  }
}

class NotificationService {
  notifyOrderPlaced(orderId: string): boolean {
    return orderId.length > 0;
  }
}

interface CapturedNode {
  readonly signature: { readonly className: string; readonly methodName: string };
  readonly spanContext?: { readonly traceId: string };
  readonly children: readonly CapturedNode[];
}

function flatten(nodes: readonly CapturedNode[]): CapturedNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

/**
 * The end-to-end proof of the adoption contract: background work started inside a request handler is
 * in that request's capture exactly once, on the request's trace — whether it finished first or was
 * still in flight when the handler captured.
 */
describe("async work started inside an Express request", () => {
  function createApp(ctx: AsyncNarrativeContext, held?: Promise<void>) {
    const orders = traceObject(new OrderService(), ctx, undefined, { className: "OrderService" });
    const notifications = traceObject(new NotificationService(), ctx, undefined, {
      className: "NotificationService",
    });
    const app = express();
    app.use(narrativeTrace(ctx));
    app.get("/orders/:customerId", async (req, res) => {
      const orderId = orders.placeOrder(req.params.customerId);
      const background = ctx.run(async () => {
        notifications.notifyOrderPlaced(orderId);
        if (held) await held;
      });
      if (!held) await background;
      res.json({ orderId, trace: ctx.captureTrace() });
    });
    return app;
  }

  test("finished background work is in the request's capture exactly once", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const res = await request(createApp(ctx)).get("/orders/C1").expect(200);

    const nodes = flatten(res.body.trace.roots);
    const notified = nodes.filter((n) => n.signature.methodName === "notifyOrderPlaced");
    expect(notified).toHaveLength(1);
    expect(notified[0]?.spanContext?.traceId).toBe(res.body.trace.roots[0].spanContext.traceId);
  });

  test("background work still in flight is in the request's capture exactly once", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const held = deferred();
    const app = createApp(ctx, held.promise);

    const res = await request(app).get("/orders/C2").expect(200);
    held.resolve();

    const nodes = flatten(res.body.trace.roots);
    const notified = nodes.filter((n) => n.signature.methodName === "notifyOrderPlaced");
    expect(notified).toHaveLength(1);
    expect(notified[0]?.spanContext?.traceId).toBe(res.body.trace.roots[0].spanContext.traceId);
  });

  test("two concurrent requests each report only their own background work", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);

    const [first, second] = await Promise.all([
      request(app).get("/orders/C1").expect(200),
      request(app).get("/orders/C2").expect(200),
    ]);

    for (const res of [first, second]) {
      const nodes = flatten(res.body.trace.roots);
      expect(nodes.filter((n) => n.signature.methodName === "notifyOrderPlaced")).toHaveLength(1);
      expect(nodes.filter((n) => n.signature.methodName === "placeOrder")).toHaveLength(1);
      // One trace id across the whole request, and no sign of the other request's.
      expect(new Set(nodes.map((n) => n.spanContext?.traceId)).size).toBe(1);
    }
    expect(first.body.trace.roots[0].spanContext.traceId).not.toBe(
      second.body.trace.roots[0].spanContext.traceId,
    );
  });

  test("the background call is tagged async and carries the request's identity", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const res = await request(createApp(ctx)).get("/orders/C1").expect(200);

    const notified = flatten(res.body.trace.roots).find(
      (n) => n.signature.methodName === "notifyOrderPlaced",
    ) as (CapturedNode & { concurrency?: { kind: string } }) | undefined;
    expect(notified?.concurrency?.kind).toBe("async");
    expect((notified?.spanContext as { httpRoute?: string })?.httpRoute).toBe("/orders/C1");
  });
});
