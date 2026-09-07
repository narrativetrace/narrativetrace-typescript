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
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";
import {
  extractRequestInfo,
  getNarrativeContext,
  narrativeTrace,
} from "../src/narrative-trace-middleware.js";

afterEach(() => LogContext.reset());

describe("extractRequestInfo", () => {
  test("extracts method, path, and IP from request", () => {
    const req = { method: "POST", path: "/api/orders", ip: "10.0.0.1" } as never;
    const info = extractRequestInfo(req);
    expect(info.httpMethod).toBe("POST");
    expect(info.httpRoute).toBe("/api/orders");
    expect(info.clientIp).toBe("10.0.0.1");
  });

  test("falls back to 'unknown' when req.ip is undefined", () => {
    const req = { method: "GET", path: "/health", ip: undefined } as never;
    const info = extractRequestInfo(req);
    expect(info.clientIp).toBe("unknown");
  });
});

class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

function createApp(ctx: AsyncNarrativeContext) {
  const svc = traceObject(new GreetingService(), ctx, undefined, { className: "GreetingService" });
  const app = express();
  app.use(narrativeTrace(ctx));
  app.get("/hello/:name", (req, res) => {
    const msg = svc.greet(req.params.name);
    res.json({ message: msg, trace: ctx.captureTrace() });
  });
  return app;
}

describe("narrativeTrace middleware", () => {
  test("traced service spans carry HTTP fields from request", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);

    const res = await request(app).get("/hello/world").expect(200);

    const root = res.body.trace.roots[0];
    expect(root.signature.className).toBe("GreetingService");
    expect(root.spanContext.httpMethod).toBe("GET");
    expect(root.spanContext.httpRoute).toBe("/hello/world");
  });

  test("sequential requests get unique traceIds", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);

    const res1 = await request(app).get("/hello/alice").expect(200);
    const res2 = await request(app).get("/hello/bob").expect(200);

    const traceId1 = res1.body.trace.roots[0].spanContext.traceId;
    const traceId2 = res2.body.trace.roots[0].spanContext.traceId;
    expect(traceId1).not.toBe(traceId2);
  });

  test("LogContext contains traceId and HTTP fields during handler", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let captured: Record<string, string | number> = {};
    const app = express();
    app.use(narrativeTrace(ctx));
    app.get("/check", (_req, res) => {
      captured = LogContext.getAll();
      res.json({ ok: true });
    });

    await request(app).get("/check").expect(200);

    expect(captured["trace_id"]).toBeDefined();
    expect(captured["nt.http.method"]).toBe("GET");
    expect(captured["nt.http.route"]).toBe("/check");
  });

  test("extractUser populates identity fields in LogContext", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let captured: Record<string, string | number> = {};
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        extractUser: (req) => ({ enduserId: req.headers["x-user-id"] as EnduserId }),
      }),
    );
    app.get("/whoami", (_req, res) => {
      captured = LogContext.getAll();
      res.json({ ok: true });
    });

    await request(app).get("/whoami").set("x-user-id", "user-42").expect(200);

    expect(captured["nt.enduser.id"]).toBe("user-42");
  });

  test("keeps user log fields when the request extractor throws", async () => {
    // Java stamps the user MDC keys independently of request info, so a failing request
    // extractor must not also cost the identity fields that were resolved successfully.
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let captured: Record<string, string | number> = {};
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        extractRequest: () => {
          throw new Error("route lookup failed");
        },
        extractUser: () => ({ enduserId: "user-42" as EnduserId }),
      }),
    );
    app.get("/whoami", (_req, res) => {
      captured = LogContext.getAll();
      res.json({ ok: true });
    });

    await request(app).get("/whoami").expect(200);

    expect(captured.trace_id).toBeDefined();
    expect(captured["nt.enduser.id"]).toBe("user-42");
  });

  test("extractUser option stamps identity fields on spans", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        extractUser: (req) => ({ enduserId: req.headers["x-user-id"] as EnduserId }),
      }),
    );
    app.get("/hello", (_req, res) => {
      const msg = svc.greet("test");
      res.json({ message: msg, trace: ctx.captureTrace() });
    });

    const res = await request(app).get("/hello").set("x-user-id", "user-42").expect(200);

    expect(res.body.trace.roots[0].spanContext.enduserId).toBe("user-42");
  });

  test("onRequestComplete fires after response finishes with trace", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    let completedTrace: unknown;
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: (_req, _res, c) => {
          completedTrace = c.captureTrace();
        },
      }),
    );
    app.get("/hello", (_req, res) => {
      svc.greet("test");
      res.json({ ok: true });
    });

    await request(app).get("/hello").expect(200);

    expect(completedTrace).toBeDefined();
    expect((completedTrace as { roots: unknown[] }).roots).toHaveLength(1);
  });

  test("onRequestComplete fires even when handler throws", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let called = false;
    const app = express();
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
    // biome-ignore lint/suspicious/noExplicitAny: Express error handler signature
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: err.message });
    });

    await request(app).get("/boom").expect(500);

    expect(called).toBe(true);
  });

  test("N interleaved requests each capture only their own span and route", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = express();
    app.use(narrativeTrace(ctx));
    app.get("/hello/:name", async (req, res) => {
      const msg = svc.greet(req.params.name);
      // stagger completion so requests genuinely interleave
      await new Promise((r) => setTimeout(r, req.params.name.length * 3));
      res.json({ message: msg, trace: ctx.captureTrace() });
    });

    const names = ["a", "bb", "ccc", "dddd", "eeeee"];
    const results = await Promise.all(names.map((n) => request(app).get(`/hello/${n}`)));

    const traceIds = new Set<string>();
    results.forEach((res, i) => {
      const roots = res.body.trace.roots;
      expect(roots).toHaveLength(1);
      expect(roots[0].spanContext.httpRoute).toBe(`/hello/${names[i]}`);
      traceIds.add(roots[0].spanContext.traceId);
    });
    expect(traceIds.size).toBe(names.length);
  });

  test("a throwing extractUser does not fail the request", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        extractUser: () => {
          throw new Error("boom");
        },
      }),
    );
    app.get("/ok", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ok").expect(200);
    expect(res.body.ok).toBe(true);
  });

  test("a throwing extractRequest does not fail the request", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        extractRequest: () => {
          throw new Error("boom");
        },
      }),
    );
    app.get("/ok", (_req, res) => res.json({ ok: true }));

    await request(app).get("/ok").expect(200);
  });

  test("onRequestComplete receives statusCode and durationMs", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let completion: { statusCode: number; durationMs: number } | undefined;
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: (_req, _res, _ctx, c) => {
          completion = c;
        },
      }),
    );
    app.get("/hello", (_req, res) => res.status(201).json({ ok: true }));

    await request(app).get("/hello").expect(201);
    expect(completion?.statusCode).toBe(201);
    expect(completion?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("a throwing onRequestComplete does not affect the response", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: () => {
          throw new Error("boom");
        },
      }),
    );
    app.get("/ok", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ok").expect(200);
    expect(res.body.ok).toBe(true);
  });

  test("excludedPaths skips context and log scope", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let scopeEmpty = false;
    const app = express();
    app.use(narrativeTrace(ctx, { excludedPaths: ["/health"] }));
    app.get("/health", (_req, res) => {
      scopeEmpty = Object.keys(LogContext.getAll()).length === 0;
      res.json({ ok: true });
    });

    await request(app).get("/health").expect(200);
    expect(scopeEmpty).toBe(true);
  });

  test("getNarrativeContext returns the middleware context during a request", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    let resolved: unknown;
    const app = express();
    app.use(narrativeTrace(ctx));
    app.get("/who", (req, res) => {
      resolved = getNarrativeContext(req);
      res.json({ ok: true });
    });

    await request(app).get("/who").expect(200);
    expect(resolved).toBe(ctx);
  });

  test("extractUser returning undefined skips user context", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        extractUser: () => undefined,
      }),
    );
    app.get("/hello", (_req, res) => {
      const msg = svc.greet("test");
      res.json({ message: msg, trace: ctx.captureTrace() });
    });

    const res = await request(app).get("/hello").expect(200);

    expect(res.body.trace.roots[0].spanContext.enduserId).toBeUndefined();
  });

  test("middleware works when context is inactive (level off)", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("off"));
    const app = express();
    app.use(narrativeTrace(ctx));
    app.get("/ping", (_req, res) => res.json({ pong: true }));

    const res = await request(app).get("/ping").expect(200);

    expect(res.body.pong).toBe(true);
  });

  test("custom extractRequest overrides default extraction", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        extractRequest: () => ({
          httpMethod: "CUSTOM",
          httpRoute: "/custom" as never,
          clientIp: "1.2.3.4" as never,
        }),
      }),
    );
    app.get("/hello", (_req, res) => {
      svc.greet("test");
      res.json({ trace: ctx.captureTrace() });
    });

    const res = await request(app).get("/hello").expect(200);

    expect(res.body.trace.roots[0].spanContext.httpMethod).toBe("CUSTOM");
    expect(res.body.trace.roots[0].spanContext.httpRoute).toBe("/custom");
  });

  test("synchronous handler error passes through to Express error middleware", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = express();
    app.use(narrativeTrace(ctx));
    app.get("/fail", () => {
      throw new Error("sync boom");
    });
    // biome-ignore lint/suspicious/noExplicitAny: Express error handler signature
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: err.message });
    });

    const res = await request(app).get("/fail").expect(500);

    expect(res.body.error).toBe("sync boom");
  });

  test("traceparent header propagates traceId to spans", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);
    const parentTraceId = "aabbccdd11223344aabbccdd11223344";

    const res = await request(app)
      .get("/hello/world")
      .set("traceparent", `00-${parentTraceId}-00f067aa0ba902b7-01`)
      .expect(200);

    expect(res.body.trace.roots[0].spanContext.traceId).toBe(parentTraceId);
  });

  test("invalid traceparent header is ignored — new traceId generated", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const app = createApp(ctx);

    const res = await request(app)
      .get("/hello/world")
      .set("traceparent", "invalid-header")
      .expect(200);

    const traceId = res.body.trace.roots[0].spanContext.traceId;
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceId).not.toBe("00000000000000000000000000000000");
  });
});

// Bug-hunt no-poison contract: a request-scoped context that is never reset leaves
// its spans in the shared pipeline for the life of the process — the documented usage pattern
// (framework-integration-guide.md) shares one AsyncNarrativeContext, and so one pipeline, across
// every request. Cleanup (capture, export callback, reset) must run independently of whether an
// onRequestComplete callback was even supplied.
describe("narrativeTrace middleware no-poison contract: request-scoped cleanup", () => {
  test("after the response finishes, the request's spans no longer sit in the shared pipeline", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = express();
    app.use(narrativeTrace(ctx));
    app.get("/hello", (_req, res) => {
      svc.greet("test");
      res.json({ ok: true });
    });

    await request(app).get("/hello").expect(200);
    await new Promise((r) => setTimeout(r, 10));

    ctx.eventPipeline.flush();
    expect(ctx.eventPipeline.events()).toHaveLength(0);
  });

  test("reset still runs when onRequestComplete throws", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svc = traceObject(new GreetingService(), ctx, undefined, {
      className: "GreetingService",
    });
    const app = express();
    app.use(
      narrativeTrace(ctx, {
        onRequestComplete: () => {
          throw new Error("export boom");
        },
      }),
    );
    app.get("/hello", (_req, res) => {
      svc.greet("test");
      res.json({ ok: true });
    });

    await request(app).get("/hello").expect(200);
    await new Promise((r) => setTimeout(r, 10));

    ctx.eventPipeline.flush();
    expect(ctx.eventPipeline.events()).toHaveLength(0);
  });
});
