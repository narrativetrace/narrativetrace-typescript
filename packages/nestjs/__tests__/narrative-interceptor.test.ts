// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core";
import { LogContext } from "@narrativetrace/observability";
import { delay, firstValueFrom, map, of, throwError } from "rxjs";
import { afterEach, describe, expect, test } from "vitest";
import {
  type AutoProxyOptions,
  DEFAULT_NESTJS_BUFFER_CAPACITY,
} from "../src/auto-proxy-options.js";
import { NarrativeInterceptor } from "../src/narrative-interceptor.js";
import { NarrativeStorage } from "../src/narrative-storage.js";

afterEach(() => LogContext.reset());

function mockExecCtx(req: Record<string, unknown> = {}, res: Record<string, unknown> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: "POST", path: "/api/orders", ip: "10.0.0.1", ...req }),
      getResponse: () => ({ statusCode: 200, ...res }),
    }),
  } as any;
}

function createInterceptor(options: AutoProxyOptions = {}) {
  const storage = new NarrativeStorage();
  const interceptor = new NarrativeInterceptor(storage, options);
  return { storage, interceptor };
}

describe("NarrativeInterceptor DI wiring", () => {
  test("onRequestComplete receives the captured tree, status and duration", async () => {
    let completion:
      | { statusCode: number; durationMs: number; tree: { roots: unknown[] } }
      | undefined;
    const { storage, interceptor } = createInterceptor({
      onRequestComplete: (_ctx, c) => {
        completion = c as never;
      },
    });
    const handler = {
      handle: () => {
        const ctx = storage.current()!;
        const span = ctx.enterMethod("Svc", "op", []);
        ctx.exitMethodWithReturn('"ok"', span);
        return of("done");
      },
    } as never;

    await firstValueFrom(interceptor.intercept(mockExecCtx({}, { statusCode: 201 }), handler));

    expect(completion?.statusCode).toBe(201);
    expect(completion?.durationMs).toBeGreaterThanOrEqual(0);
    expect(completion?.tree.roots).toHaveLength(1);
  });

  test("adopts an inbound traceparent as the request traceId", async () => {
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const header = `00-${traceId}-b7ad6b7169203331-01`;
    const { storage, interceptor } = createInterceptor();
    let seen: string | undefined;
    const handler = {
      handle: () => {
        seen = storage.current()!.traceId();
        return of("ok");
      },
    } as never;

    await firstValueFrom(
      interceptor.intercept(mockExecCtx({ headers: { traceparent: header } }), handler),
    );
    expect(seen).toBe(traceId);
  });

  test("extractUser stamps identity and a throwing extractUser does not fail the request", async () => {
    const { storage, interceptor } = createInterceptor({
      extractUser: () => ({ enduserId: "user-9" as never }),
    });
    let spanCtx: { enduserId?: string } | undefined;
    const handler = {
      handle: () => {
        const ctx = storage.current()!;
        const span = ctx.enterMethod("Svc", "op", []);
        ctx.exitMethodWithReturn(null, span);
        spanCtx = ctx.captureTrace().roots[0]?.spanContext as never;
        return of("ok");
      },
    } as never;

    await firstValueFrom(interceptor.intercept(mockExecCtx({}), handler));
    expect(spanCtx?.enduserId).toBe("user-9");
  });
});

describe("NarrativeInterceptor", () => {
  test("stores context in NarrativeStorage during handler", async () => {
    const { storage, interceptor } = createInterceptor();
    let captured: unknown;
    const handler = {
      handle: () => {
        captured = storage.current();
        return of("ok");
      },
    } as any;
    await firstValueFrom(interceptor.intercept(mockExecCtx(), handler));
    expect(captured).toBeDefined();
  });

  test("context not available after handler completes", async () => {
    const { storage, interceptor } = createInterceptor();
    await firstValueFrom(interceptor.intercept(mockExecCtx(), { handle: () => of("ok") } as any));
    expect(storage.current()).toBeUndefined();
  });

  test("populates HTTP request fields on context", async () => {
    const { storage, interceptor } = createInterceptor();
    let spanCtx: any;
    const handler = {
      handle: () => {
        const ctx = storage.current()!;
        ctx.enterMethod("Svc", "op", []);
        ctx.exitMethodWithReturn(null);
        spanCtx = ctx.captureTrace()?.roots?.[0]?.spanContext;
        return of("ok");
      },
    } as any;
    await firstValueFrom(interceptor.intercept(mockExecCtx(), handler));
    expect(spanCtx?.httpMethod).toBe("POST");
    expect(spanCtx?.httpRoute).toBe("/api/orders");
    expect(spanCtx?.clientIp).toBe("10.0.0.1");
  });

  test("LogContext carries trace_id and HTTP fields during the handler", async () => {
    // Express and Hono wrap the handler in LogContext.run so log lines emitted inside it carry
    // trace_id/route/user fields; the interceptor only stamped the narrative context's own spans,
    // leaving NestJS apps with no MDC-equivalent correlation for their own logger calls.
    const { storage, interceptor } = createInterceptor();
    let captured: Record<string, string | number> = {};
    let expectedTraceId: string | undefined;
    const handler = {
      handle: () => {
        captured = LogContext.getAll();
        expectedTraceId = storage.current()?.traceId();
        return of("ok");
      },
    } as any;

    await firstValueFrom(interceptor.intercept(mockExecCtx(), handler));

    expect(captured.trace_id).toBe(expectedTraceId);
    expect(captured["nt.http.method"]).toBe("POST");
    expect(captured["nt.http.route"]).toBe("/api/orders");
    expect(captured["nt.client.ip"]).toBe("10.0.0.1");
  });

  test("uses serviceName from options", async () => {
    const { storage, interceptor } = createInterceptor({ serviceName: "order-service" });
    let serviceName: string | undefined;
    const handler = {
      handle: () => {
        const ctx = storage.current()!;
        ctx.enterMethod("Svc", "op", []);
        ctx.exitMethodWithReturn(null);
        serviceName = ctx.captureTrace()?.roots?.[0]?.spanContext?.serviceName;
        return of("ok");
      },
    } as any;
    await firstValueFrom(interceptor.intercept(mockExecCtx(), handler));
    expect(serviceName).toBe("order-service");
  });

  test("includes serviceVersion and environment when provided", async () => {
    const opts = { serviceName: "svc", serviceVersion: "1.0", environment: "staging" };
    const { storage, interceptor } = createInterceptor(opts);
    let sc: any;
    const handler = {
      handle: () => {
        const ctx = storage.current()!;
        ctx.enterMethod("Svc", "op", []);
        ctx.exitMethodWithReturn(null);
        // Captured inside the handler, before the interceptor's own finalize() resets the
        // request-scoped context (no-poison contract) — the same reason
        // onRequestComplete captures the tree before completion, not after.
        sc = ctx.captureTrace()?.roots?.[0]?.spanContext;
        return of("ok");
      },
    } as any;
    await firstValueFrom(interceptor.intercept(mockExecCtx(), handler));
    expect(sc?.serviceVersion).toBe("1.0");
    expect(sc?.environment).toBe("staging");
  });

  test("omits serviceVersion and environment when not provided", async () => {
    const { storage, interceptor } = createInterceptor({ serviceName: "svc" });
    let sc: any;
    const handler = {
      handle: () => {
        const ctx = storage.current()!;
        ctx.enterMethod("Svc", "op", []);
        ctx.exitMethodWithReturn(null);
        sc = ctx.captureTrace()?.roots?.[0]?.spanContext;
        return of("ok");
      },
    } as any;
    await firstValueFrom(interceptor.intercept(mockExecCtx(), handler));
    expect(sc?.serviceName).toBe("svc");
    expect("serviceVersion" in (sc ?? {})).toBe(false);
    expect("environment" in (sc ?? {})).toBe(false);
  });

  test("handles errors without leaking context", async () => {
    const { storage, interceptor } = createInterceptor();
    const obs = interceptor.intercept(mockExecCtx(), {
      handle: () => throwError(() => new Error("fail")),
    } as any);
    try {
      await firstValueFrom(obs);
    } catch (err: unknown) {
      expect((err as Error).message).toBe("fail");
    }
    expect(storage.current()).toBeUndefined();
  });

  test("passes handler result through", async () => {
    const { interceptor } = createInterceptor();
    const result = await firstValueFrom(
      interceptor.intercept(mockExecCtx(), { handle: () => of({ id: 42 }) } as any),
    );
    expect(result).toEqual({ id: 42 });
  });

  test("preserves context across async observable emissions", async () => {
    const { interceptor, storage } = createInterceptor();
    let seenDuringMap: unknown;

    const result = await new Promise<string>((resolve, reject) => {
      interceptor
        .intercept(mockExecCtx(), {
          handle: () =>
            of("ok").pipe(
              delay(0),
              map((value) => {
                seenDuringMap = storage.current();
                return value;
              }),
            ),
        } as any)
        .subscribe({ next: resolve, error: reject });
    });

    expect(result).toBe("ok");
    expect(seenDuringMap).toBeDefined();
  });
});

describe("per-request buffer capacity", () => {
  test("the seam's default is 8192, argued in its own doc comment", () => {
    expect(DEFAULT_NESTJS_BUFFER_CAPACITY).toBe(8192);
  });

  function traceCalls(ctx: { enterMethod: Function; exitMethodWithReturn: Function }, n: number) {
    for (let i = 0; i < n; i++) {
      const span = ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn(null, span);
    }
  }

  async function droppedEventsAfter(options: AutoProxyOptions, calls: number): Promise<number> {
    const { storage, interceptor } = createInterceptor(options);
    let dropped = 0;
    await firstValueFrom(
      interceptor.intercept(mockExecCtx(), {
        handle: () => {
          const ctx = storage.current()!;
          traceCalls(ctx, calls);
          dropped = ctx.traceLoss().droppedEvents;
          return of("ok");
        },
      } as never),
    );
    return dropped;
  }

  test("bufferCapacity override actually resizes the ring, not just accepted and ignored", async () => {
    // 5 calls = 10 events; a 2-slot ring must shed, a 1000-slot ring must not.
    await expect(droppedEventsAfter({ bufferCapacity: 2 }, 5)).resolves.toBeGreaterThan(0);
    await expect(droppedEventsAfter({ bufferCapacity: 1000 }, 5)).resolves.toBe(0);
  });

  test("an explicit pipeline overrides bufferCapacity — sizing becomes the caller's job", async () => {
    const roomyPipeline = new DualPathPipeline(null, new BufferedEventConsumer(1000));
    await expect(
      droppedEventsAfter({ bufferCapacity: 2, pipeline: roomyPipeline }, 5),
    ).resolves.toBe(0);
  });
});

// Bug-hunt no-poison contract: a request-scoped context that is never reset leaves
// its spans in a caller-supplied shared pipeline for the life of the process (the doc example
// wires one pipeline into AutoProxyModule.forRoot, shared across every request). Cleanup runs
// independently of whether an onRequestComplete callback was even supplied.
describe("NarrativeInterceptor no-poison contract: request-scoped cleanup", () => {
  function sharedPipeline() {
    return new DualPathPipeline(null, new BufferedEventConsumer(64));
  }

  async function runOneRequest(options: AutoProxyOptions): Promise<void> {
    const { storage, interceptor } = createInterceptor(options);
    await firstValueFrom(
      interceptor.intercept(mockExecCtx(), {
        handle: () => {
          const ctx = storage.current()!;
          const span = ctx.enterMethod("Svc", "op", []);
          ctx.exitMethodWithReturn('"ok"', span);
          return of("done");
        },
      } as never),
    );
  }

  test("after the request completes, its spans no longer sit in the shared pipeline", async () => {
    const pipeline = sharedPipeline();
    await runOneRequest({ pipeline });

    pipeline.flush();
    expect(pipeline.events()).toHaveLength(0);
  });

  test("reset still runs when onRequestComplete throws", async () => {
    const pipeline = sharedPipeline();
    await runOneRequest({
      pipeline,
      onRequestComplete: () => {
        throw new Error("export boom");
      },
    });

    pipeline.flush();
    expect(pipeline.events()).toHaveLength(0);
  });
});
