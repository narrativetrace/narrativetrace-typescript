// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, type TraceNode } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { AsyncNarrativeContext } from "../src/async-context.js";

/** A promise plus its resolver — the deterministic stand-in for "the worker is still awaiting". */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Adoption across `AsyncLocalStorage` scopes: work launched inside a request joins the request's
 * capture, transitively, and is visible from the moment it is published rather than only once the
 * scope that traced it has finished. Deferreds rather than timers — the window is the point.
 */
describe("async scope adoption", () => {
  function methodNames(nodes: readonly TraceNode[]): string[] {
    return nodes.map((n) => n.signature.methodName);
  }

  /** Every distinct trace id in the subtree — one means the whole chain stayed on one trace. */
  function traceIdsIn(nodes: readonly TraceNode[]): Set<string | undefined> {
    const ids = new Set<string | undefined>();
    for (const node of nodes) {
      ids.add(node.spanContext?.traceId);
      for (const id of traceIdsIn(node.children)) ids.add(id);
    }
    return ids;
  }

  test("a background scope's call is reported by the request while it is still awaiting", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const held = deferred();

    const tree = await ctx.run(async () => {
      const handle = ctx.enterMethod("OrderService", "placeOrder", []);
      const background = ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithReturn("true");
        await held.promise;
      });
      ctx.exitMethodWithReturn('"ORD-1"', handle);
      const captured = ctx.captureTrace();
      held.resolve();
      await background;
      return captured;
    });

    expect(methodNames(tree.roots)).toEqual(["placeOrder"]);
    expect(methodNames(tree.roots[0]?.children ?? [])).toEqual(["notifyOrderPlaced"]);
  });

  test("a background scope's call stays reported once it settles", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      const handle = ctx.enterMethod("OrderService", "placeOrder", []);
      await ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithReturn("true");
      });
      ctx.exitMethodWithReturn('"ORD-1"', handle);
      return ctx.captureTrace();
    });

    expect(methodNames(tree.roots)).toEqual(["placeOrder"]);
    expect(methodNames(tree.roots[0]?.children ?? [])).toEqual(["notifyOrderPlaced"]);
  });

  test("a background scope that traces only after awaiting is still handed over", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const held = deferred();

    const tree = await ctx.run(async () => {
      const handle = ctx.enterMethod("OrderService", "placeOrder", []);
      // Nothing is traced in the scope's synchronous prefix: a hand-over that ran at launch rather
      // than at settle would have unregistered the child before its first call existed.
      const background = ctx.run(async () => {
        await held.promise;
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithReturn("true");
      });
      held.resolve();
      await background;
      ctx.exitMethodWithReturn('"ORD-1"', handle);
      return ctx.captureTrace();
    });

    expect(methodNames(tree.roots[0]?.children ?? [])).toEqual(["notifyOrderPlaced"]);
  });

  test("a settled background scope leaves no live registration behind", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      const handle = ctx.enterMethod("OrderService", "placeOrder", []);
      await ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithReturn("true");
      });
      // The registration ended; adoption is what keeps the call reportable from here on.
      expect(ctx.activeScope.liveChildSpanIds()).toEqual(new Set());
      ctx.exitMethodWithReturn('"ORD-1"', handle);
      return ctx.captureTrace();
    });

    expect(methodNames(tree.roots[0]?.children ?? [])).toEqual(["notifyOrderPlaced"]);
  });

  test("a scope launched with no open span still names its own story", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const storyId = await ctx.run(async () => {
      ctx.enterMethod("OrderService", "placeOrder", []);
      ctx.exitMethodWithReturn('"ORD-1"');
      return ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithReturn("true");
        return ctx.storyId;
      });
    });

    expect(storyId).toBe("NotificationService.notifyOrderPlaced");
  });

  test("work started after the launching call returned becomes a second root", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      ctx.enterMethod("OrderService", "placeOrder", []);
      ctx.exitMethodWithReturn('"ORD-1"');
      await ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithReturn("true");
      });
      return ctx.captureTrace();
    });

    expect(methodNames(tree.roots)).toEqual(["placeOrder", "notifyOrderPlaced"]);
  });

  test("every call in the chain carries the launching scope's trace id", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      ctx.enterMethod("OrderService", "placeOrder", []);
      await ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithReturn("true");
      });
      ctx.exitMethodWithReturn('"ORD-1"');
      return ctx.captureTrace();
    });

    expect(traceIdsIn(tree.roots).size).toBe(1);
  });

  test("a background scope that rejects still hands its work over", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      const handle = ctx.enterMethod("OrderService", "placeOrder", []);
      const failing = ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.exitMethodWithException(new Error("gateway down"));
        throw new Error("gateway down");
      });
      await expect(failing).rejects.toThrow("gateway down");
      ctx.exitMethodWithReturn('"ORD-1"', handle);
      return ctx.captureTrace();
    });

    expect(methodNames(tree.roots[0]?.children ?? [])).toEqual(["notifyOrderPlaced"]);
  });

  test("a background scope that throws synchronously still hands its work over", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      const handle = ctx.enterMethod("OrderService", "placeOrder", []);
      expect(() =>
        ctx.run(() => {
          ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
          ctx.exitMethodWithReturn("true");
          throw new Error("boom");
        }),
      ).toThrow("boom");
      ctx.exitMethodWithReturn('"ORD-1"', handle);
      return ctx.captureTrace();
    });

    expect(methodNames(tree.roots[0]?.children ?? [])).toEqual(["notifyOrderPlaced"]);
  });

  test("a nested scope's first call is tagged async, and nothing deeper is", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      const handle = ctx.enterMethod("OrderService", "placeOrder", []);
      await ctx.run(async () => {
        ctx.enterMethod("NotificationService", "notifyOrderPlaced", []);
        ctx.enterMethod("EmailGateway", "send", []);
        ctx.exitMethodWithReturn("true");
        ctx.exitMethodWithReturn("true");
      });
      ctx.exitMethodWithReturn('"ORD-1"', handle);
      return ctx.captureTrace();
    });

    const notified = tree.roots[0]?.children[0];
    expect(notified?.concurrency?.kind).toBe("async");
    expect(notified?.children[0]?.signature.methodName).toBe("send");
    expect(notified?.children[0]?.concurrency).toBeUndefined();
  });

  test("a top-level scope has crossed no boundary, so its first call is untagged", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const tree = await ctx.run(async () => {
      ctx.enterMethod("OrderService", "placeOrder", []);
      ctx.exitMethodWithReturn('"ORD-1"');
      return ctx.captureTrace();
    });

    expect(tree.roots[0]?.concurrency).toBeUndefined();
  });

  test("the loss reading follows the scope that is capturing", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const loss = await ctx.run(async () => {
      ctx.enterMethod("OrderService", "placeOrder", []);
      ctx.exitMethodWithReturn('"ORD-1"');
      return ctx.traceLoss();
    });

    expect(loss).toEqual({
      droppedEvents: 0,
      refusedScopes: 0,
      refusedSpans: 0,
      discardedSpans: 0,
    });
  });

  test("two concurrent requests never adopt each other's work", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const request = (name: string) =>
      ctx.run(async () => {
        ctx.enterMethod("OrderService", name, []);
        await ctx.run(async () => {
          ctx.enterMethod("NotificationService", `${name}Notified`, []);
          ctx.exitMethodWithReturn("true");
        });
        ctx.exitMethodWithReturn('"ok"');
        return ctx.captureTrace();
      });

    const [first, second] = await Promise.all([request("placeOrder"), request("cancelOrder")]);

    expect(methodNames(first.roots)).toEqual(["placeOrder"]);
    expect(methodNames(first.roots[0]?.children ?? [])).toEqual(["placeOrderNotified"]);
    expect(methodNames(second.roots)).toEqual(["cancelOrder"]);
    expect(methodNames(second.roots[0]?.children ?? [])).toEqual(["cancelOrderNotified"]);
  });
});
