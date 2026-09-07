// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type {
  ClientIp,
  EnduserId,
  HttpRoute,
  ServiceIdentity,
  TraceEvent,
} from "@narrativetrace/core";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  isValidTraceId,
  NarrativeTraceConfig,
  parameterCapture,
  type TraceId,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { AsyncNarrativeContext } from "../src/async-context.js";

describe("AsyncNarrativeContext", () => {
  test("records a simple method call", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("Svc", "op", [parameterCapture("id", '"x"', false)]);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.className).toBe("Svc");
    expect(tree.roots[0]?.signature.methodName).toBe("op");
  });

  test("run() creates isolated context separate from default", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());

    ctx.enterMethod("Default", "outside", []);
    ctx.exitMethodWithReturn(null);

    ctx.run(() => {
      ctx.enterMethod("Isolated", "inside", []);
      ctx.exitMethodWithReturn(null);
    });

    const defaultTree = ctx.captureTrace();
    expect(defaultTree.roots).toHaveLength(1);
    expect(defaultTree.roots[0]?.signature.className).toBe("Default");
  });

  test("context propagates across async boundaries", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());

    const tree = await ctx.run(async () => {
      ctx.enterMethod("Svc", "start", []);

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          ctx.enterMethod("Repo", "query", []);
          ctx.exitMethodWithReturn('"found"');
          resolve();
        }, 5);
      });

      ctx.exitMethodWithReturn(null);
      return ctx.captureTrace();
    });

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.methodName).toBe("start");
    expect(tree.roots[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.signature.className).toBe("Repo");
  });

  test("concurrent runs are isolated from each other", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());

    const [tree1, tree2] = await Promise.all([
      ctx.run(async () => {
        ctx.enterMethod("Svc", "taskA", []);
        await new Promise((r) => setTimeout(r, 10));
        ctx.exitMethodWithReturn(null);
        return ctx.captureTrace();
      }),
      ctx.run(async () => {
        ctx.enterMethod("Svc", "taskB", []);
        await new Promise((r) => setTimeout(r, 10));
        ctx.exitMethodWithReturn(null);
        return ctx.captureTrace();
      }),
    ]);

    expect(tree1.roots).toHaveLength(1);
    expect(tree1.roots[0]?.signature.methodName).toBe("taskA");
    expect(tree2.roots).toHaveLength(1);
    expect(tree2.roots[0]?.signature.methodName).toBe("taskB");
  });

  test("isActive reflects config level", () => {
    const active = new AsyncNarrativeContext(new NarrativeTraceConfig());
    expect(active.isActive).toBe(true);

    const inactive = new AsyncNarrativeContext(new NarrativeTraceConfig("off"));
    expect(inactive.isActive).toBe(false);
  });

  test("reset clears trace in current run scope", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());

    ctx.run(() => {
      ctx.enterMethod("Svc", "op1", []);
      ctx.exitMethodWithReturn(null);
      ctx.reset();
      ctx.enterMethod("Svc", "op2", []);
      ctx.exitMethodWithReturn(null);
      const tree = ctx.captureTrace();
      expect(tree.roots).toHaveLength(1);
      expect(tree.roots[0]?.signature.methodName).toBe("op2");
    });
  });

  test("exitMethodWithException records error in run scope", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());

    ctx.run(() => {
      ctx.enterMethod("Svc", "fail", []);
      ctx.exitMethodWithException(new Error("boom"));
      const tree = ctx.captureTrace();
      expect(tree.roots).toHaveLength(1);
      const outcome = tree.roots[0]?.outcome;
      expect(outcome?.kind).toBe("threw");
      if (outcome?.kind === "threw") {
        expect((outcome.error as Error).message).toBe("boom");
      }
    });
  });

  test("enterMethod returns spanId from delegate", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    const h = ctx.enterMethod("Svc", "op", []);
    expect(typeof h).toBe("string");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    ctx.exitMethodWithReturn(null, h);
  });

  test("detachFrame delegates to current context", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    const h = ctx.enterMethod("Svc", "op", []);
    ctx.detachFrame(h);
    // New enter should not nest under detached
    ctx.enterMethod("Svc", "next", []);
    ctx.exitMethodWithReturn(null);
    ctx.exitMethodWithReturn(null, h);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(2);
  });

  test("exit with handle delegates correctly", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    const h0 = ctx.enterMethod("Svc", "a", []);
    const h1 = ctx.enterMethod("Svc", "b", []);
    ctx.exitMethodWithReturn('"b"', h1);
    ctx.exitMethodWithReturn('"a"', h0);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(1);
  });

  test("events from run() scope reach provided pipeline", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline);
    ctx.run(() => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
    });
    expect(received).toHaveLength(2);
    expect(received[0]?.type).toBe("enter");
    expect(received[1]?.type).toBe("exit");
  });

  test("concurrent runs sharing pipeline each capture own trace", async () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline);
    const [tree1, tree2] = await Promise.all([
      ctx.run(async () => {
        ctx.enterMethod("Svc", "taskA", []);
        await new Promise((r) => setTimeout(r, 5));
        ctx.exitMethodWithReturn(null);
        return ctx.captureTrace();
      }),
      ctx.run(async () => {
        ctx.enterMethod("Svc", "taskB", []);
        await new Promise((r) => setTimeout(r, 5));
        ctx.exitMethodWithReturn(null);
        return ctx.captureTrace();
      }),
    ]);
    expect(tree1.roots).toHaveLength(1);
    expect(tree1.roots[0]?.signature.methodName).toBe("taskA");
    expect(tree2.roots).toHaveLength(1);
    expect(tree2.roots[0]?.signature.methodName).toBe("taskB");
  });

  test("default context (outside run) uses provided pipeline", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    expect(received).toHaveLength(2);
  });

  // runScoped sets the ALS scope so that enterMethod inside the scope
  // reads the handle as the parent — even after detachFrame cleared activeStack.
  test("runScoped sets scope — enterMethod reads parent from ALS", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    const hOuter = ctx.enterMethod("Svc", "outer", []);
    ctx.detachFrame(hOuter);
    // activeStack is now empty, but runScoped provides ALS parent
    ctx.runScoped(hOuter, () => {
      ctx.enterMethod("Svc", "inner", []);
      ctx.exitMethodWithReturn('"inner-val"');
    });
    ctx.exitMethodWithReturn('"outer-val"', hOuter);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("outer");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("inner");
  });

  test("service identity propagates to events in run() scope", () => {
    const identity: ServiceIdentity = {
      serviceName: "payment-service",
      serviceVersion: "1.0.0",
      environment: "production",
    };
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline, identity);
    ctx.run(() => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
    });

    const enter = received.find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.serviceName).toBe("payment-service");
    expect(enter?.type === "enter" && enter.spanContext.serviceVersion).toBe("1.0.0");
    expect(enter?.type === "enter" && enter.spanContext.environment).toBe("production");
  });

  test("service identity propagates across concurrent runs", async () => {
    const identity: ServiceIdentity = { serviceName: "inventory-service" };
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(64));
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline, identity);

    await Promise.all([
      ctx.run(async () => {
        ctx.enterMethod("Svc", "taskA", []);
        await new Promise((r) => setTimeout(r, 5));
        ctx.exitMethodWithReturn(null);
      }),
      ctx.run(async () => {
        ctx.enterMethod("Svc", "taskB", []);
        await new Promise((r) => setTimeout(r, 5));
        ctx.exitMethodWithReturn(null);
      }),
    ]);

    const enters = received.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(2);
    for (const e of enters) {
      if (e.type === "enter") {
        expect(e.spanContext.serviceName).toBe("inventory-service");
      }
    }
  });

  test("nested run() inherits traceId and parent from outer run", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
    ctx.run(() => {
      const outerSpan = ctx.enterMethod("Svc", "outer", []);
      ctx.run(() => {
        ctx.enterMethod("Repo", "inner", []);
        ctx.exitMethodWithReturn(null);
        const tree = ctx.captureTrace();
        expect(tree.roots).toHaveLength(1);
        expect(tree.roots[0]?.spanContext?.parentSpanId).toBe(outerSpan);
      });
      ctx.exitMethodWithReturn(null, outerSpan);
    });
  });

  test("parentOf returns parent span id", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const outer = ctx.enterMethod("Svc", "op", []);
    const inner = ctx.enterMethod("Repo", "find", []);
    expect(ctx.parentOf(inner)).toBe(outer);
    ctx.exitMethodWithReturn(null, inner);
    ctx.exitMethodWithReturn(null, outer);
  });

  test("traceId() eagerly generates a valid trace id", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const id = ctx.traceId();
    expect(isValidTraceId(id)).toBe(true);
  });

  test("setRequestContext() and setUserContext() stamp fields on spans", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    ctx.setRequestContext("POST", "/api" as HttpRoute, "10.0.0.1" as ClientIp);
    ctx.setUserContext("user-1" as EnduserId);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const tree = ctx.captureTrace();
    const sc = tree.roots[0]?.spanContext;
    expect(sc?.httpMethod).toBe("POST");
    expect(sc?.enduserId).toBe("user-1");
  });

  test("run() with inheritedTraceId uses the provided traceId", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const inherited = "aabbccdd11223344aabbccdd11223344" as TraceId;

    ctx.run(() => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn(null);
      const tree = ctx.captureTrace();
      expect(tree.roots[0]?.spanContext?.traceId).toBe(inherited);
    }, inherited);
  });

  test("run() without inheritedTraceId generates a new traceId", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    ctx.run(() => {
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn(null);
      const tree = ctx.captureTrace();
      expect(isValidTraceId(tree.roots[0]?.spanContext?.traceId ?? "")).toBe(true);
    });
  });

  test("activeSpanId returns the active span from current scope", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    expect(ctx.activeSpanId).toBeNull();
    const spanId = ctx.enterMethod("Svc", "op", []);
    expect(ctx.activeSpanId).toBe(spanId);
    ctx.exitMethodWithReturn(null);
  });

  test("default pipeline is shared between AsyncNarrativeContext and its default inner context", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
  });

  test("fork-join forked spans appear as children when using default pipeline", async () => {
    const { ForkJoinGroup } = await import("@narrativetrace/core");
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    ctx.enterMethod("OrderService", "placeOrder", []);
    const group = ForkJoinGroup.create(ctx);
    group.fork((forked) => {
      forked.enterMethod("DiscountService", "calculate", []);
      forked.exitMethodWithReturn("0.10");
    });
    await group.join();
    ctx.exitMethodWithReturn("done");
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.signature.className).toBe("DiscountService");
  });

  test("nested run inherits request and user context from outer scope", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    ctx.run(() => {
      ctx.setRequestContext("POST", "/api/orders" as HttpRoute, "10.0.0.1" as ClientIp);
      ctx.setUserContext("user-1" as EnduserId);
      ctx.enterMethod("OrderService", "outer", []);

      ctx.run(() => {
        ctx.enterMethod("InventoryService", "inner", []);
        ctx.exitMethodWithReturn(null);

        const tree = ctx.captureTrace();
        const spanContext = tree.roots[0]?.spanContext;

        expect(spanContext?.parentSpanId).not.toBeNull();
        expect(spanContext?.httpMethod).toBe("POST");
        expect(spanContext?.httpRoute).toBe("/api/orders");
        expect(spanContext?.clientIp).toBe("10.0.0.1");
        expect(spanContext?.enduserId).toBe("user-1");
      });

      ctx.exitMethodWithReturn(null);
    });
  });

  // Bug-hunt no-poison contract: run() detects whether fn()'s result is thenable
  // (to defer the live-child hand-over until it settles) by reading `.then` — a hostile
  // thenable's registration must not replace the value fn() actually produced.
  describe("no-poison contract: settling a hostile thenable result", () => {
    test("a `then` getter that throws still returns the value fn() produced", () => {
      const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
      class HostileThenable {
        // biome-ignore lint/suspicious/noThenProperty: testing a hostile then getter
        get then(): never {
          throw new Error("then getter refuses");
        }
      }
      const hostile = new HostileThenable();

      expect(ctx.run(() => hostile)).toBe(hostile);
    });

    test("a then() method that throws on registration still returns the value fn() produced", () => {
      const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
      class HostileThenable {
        // biome-ignore lint/suspicious/noThenProperty: testing a hostile then() registration
        then(): never {
          throw new Error("then registration boom");
        }
      }
      const hostile = new HostileThenable();

      expect(ctx.run(() => hostile)).toBe(hostile);
    });

    test("a nested run() still reports its work after a hostile thenable result", () => {
      const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
      class HostileThenable {
        // biome-ignore lint/suspicious/noThenProperty: testing a hostile then() registration
        then(): never {
          throw new Error("then registration boom");
        }
      }

      const tree = ctx.run(() => {
        ctx.enterMethod("Outer", "call", []);
        ctx.run(() => {
          ctx.enterMethod("Inner", "call", []);
          ctx.exitMethodWithReturn(null);
          return new HostileThenable();
        });
        ctx.exitMethodWithReturn(null);
        return ctx.captureTrace();
      });

      expect(tree.roots[0]?.signature.methodName).toBe("call");
      expect(tree.roots[0]?.children[0]?.signature.methodName).toBe("call");
    });
  });
});
