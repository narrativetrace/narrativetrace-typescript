// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  AsyncNarrativeContext,
  type EnduserId,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";
import { LogContext } from "@narrativetrace/observability";
import { traceObject } from "@narrativetrace/proxy";
import { Hono } from "hono";
import type { GetConnInfo } from "hono/conninfo";
import { afterEach, describe, expect, test } from "vitest";
import {
  extractRequestInfo,
  getNarrativeContext,
  narrativeTrace,
  withConnInfoClientIp,
} from "../src/narrative-trace-middleware.js";

afterEach(() => LogContext.reset());

class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

function createApp(ctx: AsyncNarrativeContext) {
  const svc = traceObject(new GreetingService(), ctx, undefined, { className: "GreetingService" });
  const app = new Hono();
  app.use(narrativeTrace(ctx));
  app.get("/hello/:name", (c) => {
    const msg = svc.greet(c.req.param("name"));
    return c.json({ message: msg, trace: ctx.captureTrace() });
  });
  return app;
}

describe("narrativeTrace middleware", () => {
  test("traced service spans carry HTTP fields from request", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);

    const res = await app.request("/hello/world");
    const body = await res.json();

    const root = body.trace.roots[0];
    expect(root.signature.className).toBe("GreetingService");
    expect(root.spanContext.httpMethod).toBe("GET");
    expect(root.spanContext.httpRoute).toBe("/hello/world");
  });

  test("sequential requests get unique traceIds", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);

    const res1 = await app.request("/hello/alice");
    const res2 = await app.request("/hello/bob");
    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.trace.roots[0].spanContext.traceId).not.toBe(
      body2.trace.roots[0].spanContext.traceId,
    );
  });

  test("LogContext contains traceId and HTTP fields during handler", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let captured: Record<string, string | number> = {};
    const app = new Hono();
    app.use(narrativeTrace(ctx));
    app.get("/check", (c) => {
      captured = LogContext.getAll();
      return c.json({ ok: true });
    });

    await app.request("/check");

    expect(captured["trace_id"]).toBeDefined();
    expect(captured["nt.http.method"]).toBe("GET");
    expect(captured["nt.http.route"]).toBe("/check");
  });

  test("a spoofed x-forwarded-for header is not recorded as clientIp by default", async () => {
    // The header is attacker-controlled end to end (no trusted-proxy stripping in Hono's base
    // package), so the default must not surface it as clientIp — parity with Express's req.ip,
    // which resolves to the raw socket address unless `trust proxy` is explicitly configured.
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let captured: Record<string, string | number> = {};
    const app = new Hono();
    app.use(narrativeTrace(ctx));
    app.get("/check", (c) => {
      captured = LogContext.getAll();
      return c.json({ ok: true });
    });

    await app.request("/check", {
      headers: { "x-forwarded-for": "203.0.113.99, 10.0.0.1" },
    });

    expect(captured["nt.client.ip"]).toBe("unknown");
  });

  test("keeps user log fields when the request extractor throws", async () => {
    // Java stamps the user MDC keys independently of request info, so a failing request
    // extractor must not also cost the identity fields that were resolved successfully.
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let captured: Record<string, string | number> = {};
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        extractRequest: () => {
          throw new Error("route lookup failed");
        },
        extractUser: () => ({ enduserId: "user-42" as EnduserId }),
      }),
    );
    app.get("/whoami", (c) => {
      captured = LogContext.getAll();
      return c.json({ ok: true });
    });

    await app.request("/whoami");

    expect(captured.trace_id).toBeDefined();
    expect(captured["nt.enduser.id"]).toBe("user-42");
  });

  test("extractUser populates identity fields in LogContext", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let captured: Record<string, string | number> = {};
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        extractUser: (c) => ({ enduserId: c.req.header("x-user-id") as EnduserId }),
      }),
    );
    app.get("/whoami", (c) => {
      captured = LogContext.getAll();
      return c.json({ ok: true });
    });

    await app.request("/whoami", { headers: { "x-user-id": "user-42" } });

    expect(captured["nt.enduser.id"]).toBe("user-42");
  });

  test("extractUser option stamps identity fields on spans", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        extractUser: (c) => ({ enduserId: c.req.header("x-user-id") as EnduserId }),
      }),
    );
    app.get("/hello", (c) => {
      svc.greet("test");
      return c.json({ trace: ctx.captureTrace() });
    });

    const res = await app.request("/hello", {
      headers: { "x-user-id": "user-42" },
    });
    const body = await res.json();

    expect(body.trace.roots[0].spanContext.enduserId).toBe("user-42");
  });

  test("onRequestComplete fires after handler", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    let completedTrace: unknown;
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: (_c, c) => {
          completedTrace = c.captureTrace();
        },
      }),
    );
    app.get("/hello", (c) => {
      svc.greet("test");
      return c.json({ ok: true });
    });

    await app.request("/hello");

    expect(completedTrace).toBeDefined();
    expect((completedTrace as { roots: unknown[] }).roots).toHaveLength(1);
  });

  test("onRequestComplete fires in a finally even when the handler throws", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let called = false;
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: () => {
          called = true;
        },
      }),
    );
    app.get("/boom", () => {
      throw new Error("handler error");
    });

    await app.request("/boom");
    expect(called).toBe(true);
  });

  test("onRequestComplete receives statusCode and durationMs", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let completion: { statusCode: number; durationMs: number } | undefined;
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: (_c, _ctx, comp) => {
          completion = comp;
        },
      }),
    );
    app.get("/made", (c) => c.json({ ok: true }, 201));

    await app.request("/made");
    expect(completion?.statusCode).toBe(201);
    expect(completion?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("a throwing extractUser does not fail the request", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        extractUser: () => {
          throw new Error("boom");
        },
      }),
    );
    app.get("/ok", (c) => c.json({ ok: true }));

    const res = await app.request("/ok");
    expect(res.status).toBe(200);
  });

  test("excludedPaths skips context and log scope", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let scopeEmpty = false;
    const app = new Hono();
    app.use(narrativeTrace(ctx, { excludedPaths: ["/health"] }));
    app.get("/health", (c) => {
      scopeEmpty = Object.keys(LogContext.getAll()).length === 0;
      return c.json({ ok: true });
    });

    await app.request("/health");
    expect(scopeEmpty).toBe(true);
  });

  test("getNarrativeContext returns the middleware context during a request", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let resolved: unknown;
    const app = new Hono();
    app.use(narrativeTrace(ctx));
    app.get("/who", (c) => {
      resolved = getNarrativeContext(c);
      return c.json({ ok: true });
    });

    await app.request("/who");
    expect(resolved).toBe(ctx);
  });

  test("middleware works when context is inactive (level off)", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("off"));
    const app = new Hono();
    app.use(narrativeTrace(ctx));
    app.get("/ping", (c) => c.json({ pong: true }));

    const res = await app.request("/ping");
    const body = await res.json();

    expect(body.pong).toBe(true);
  });

  test("traceparent header propagates traceId to spans", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);
    const parentTraceId = "aabbccdd11223344aabbccdd11223344";

    const res = await app.request("/hello/world", {
      headers: { traceparent: `00-${parentTraceId}-00f067aa0ba902b7-01` },
    });
    const body = await res.json();

    expect(body.trace.roots[0].spanContext.traceId).toBe(parentTraceId);
  });
});

describe("withConnInfoClientIp", () => {
  const fakeGetConnInfo: GetConnInfo = () => ({
    remote: { address: "198.51.100.7", addressType: "IPv4" },
  });

  test("uses the connection's remote address, not a client-controlled header", () => {
    const c = { req: { method: "GET", path: "/probe", header: () => "203.0.113.99" } } as never;
    const info = withConnInfoClientIp(fakeGetConnInfo)(c);

    expect(info.clientIp).toBe("198.51.100.7");
    expect(info.httpMethod).toBe("GET");
    expect(info.httpRoute).toBe("/probe");
  });

  test("falls back to 'unknown' when the connection reports no address", () => {
    const noAddress: GetConnInfo = () => ({ remote: {} });
    const c = { req: { method: "GET", path: "/probe", header: () => undefined } } as never;

    expect(withConnInfoClientIp(noAddress)(c).clientIp).toBe("unknown");
  });

  test("composes with a custom base extractor, overriding only clientIp", () => {
    const c = { req: { method: "POST", path: "/orders", header: () => undefined } } as never;
    const customExtract = (ctx: Parameters<typeof extractRequestInfo>[0]) => ({
      ...extractRequestInfo(ctx),
      httpRoute: "/custom-route" as ReturnType<typeof extractRequestInfo>["httpRoute"],
    });

    const info = withConnInfoClientIp(fakeGetConnInfo, customExtract)(c);

    expect(info.httpRoute).toBe("/custom-route");
    expect(info.clientIp).toBe("198.51.100.7");
  });
});

// Bug-hunt no-poison contract: a request-scoped context that is never reset leaves
// its spans in the shared pipeline for the life of the process. Cleanup runs independently of
// whether an onRequestComplete callback was even supplied.
describe("narrativeTrace middleware no-poison contract: request-scoped cleanup", () => {
  test("after the response resolves, the request's spans no longer sit in the shared pipeline", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = new Hono();
    app.use(narrativeTrace(ctx));
    app.get("/hello", (c) => {
      svc.greet("test");
      return c.json({ ok: true });
    });

    await app.request("/hello");

    ctx.eventPipeline.flush();
    expect(ctx.eventPipeline.events()).toHaveLength(0);
  });

  test("reset still runs when onRequestComplete throws", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = new Hono();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: () => {
          throw new Error("export boom");
        },
      }),
    );
    app.get("/hello", (c) => {
      svc.greet("test");
      return c.json({ ok: true });
    });

    await app.request("/hello");

    ctx.eventPipeline.flush();
    expect(ctx.eventPipeline.events()).toHaveLength(0);
  });
});
