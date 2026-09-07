// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type {
  ClientIp,
  EnduserId,
  HttpRoute,
  SessionId,
  TenantId,
  TraceId,
} from "@narrativetrace/core";
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { AsyncNarrativeContext } from "@narrativetrace/core-node";
import { afterEach, describe, expect, test } from "vitest";
import { LogContext } from "../src/log-context.js";
import {
  buildRequestLogValues,
  type RequestInfo,
  withRequestTrace,
} from "../src/request-middleware.js";

afterEach(() => LogContext.reset());

function makeContext(): SyncNarrativeContext {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
}

function makeRequest(overrides?: Partial<RequestInfo>): RequestInfo {
  return {
    httpMethod: "GET",
    httpRoute: "/api/items" as HttpRoute,
    clientIp: "127.0.0.1" as ClientIp,
    ...overrides,
  };
}

describe("withRequestTrace", () => {
  test("LogContext contains traceId during handler execution", async () => {
    const ctx = makeContext();
    let captured: string | number | undefined;
    await withRequestTrace(ctx, makeRequest(), () => {
      captured = LogContext.get("trace_id");
    });
    expect(captured).toBe(ctx.traceId());
  });

  test("LogContext contains HTTP fields during handler execution", async () => {
    const ctx = makeContext();
    let capturedMethod: string | number | undefined;
    let capturedRoute: string | number | undefined;
    await withRequestTrace(
      ctx,
      makeRequest({ httpMethod: "POST", httpRoute: "/api/orders" as HttpRoute }),
      () => {
        capturedMethod = LogContext.get("nt.http.method");
        capturedRoute = LogContext.get("nt.http.route");
      },
    );
    expect(capturedMethod).toBe("POST");
    expect(capturedRoute).toBe("/api/orders");
  });

  test("LogContext contains identity fields when provided", async () => {
    const ctx = makeContext();
    let all: Record<string, string | number> = {};
    await withRequestTrace(
      ctx,
      makeRequest({
        enduserId: "user-42" as EnduserId,
        sessionId: "sess-1" as SessionId,
        tenantId: "tenant-a" as TenantId,
      }),
      () => {
        all = LogContext.getAll();
      },
    );
    expect(all["nt.enduser.id"]).toBe("user-42");
    expect(all["nt.session.id"]).toBe("sess-1");
    expect(all["nt.tenant.id"]).toBe("tenant-a");
  });

  test("LogContext does not leak trace-level fields after handler completes", async () => {
    const ctx = makeContext();
    await LogContext.run({}, async () => {
      await withRequestTrace(ctx, makeRequest(), () => {});
      expect(LogContext.get("trace_id")).toBeUndefined();
      expect(LogContext.get("nt.http.method")).toBeUndefined();
    });
  });

  test("works with async handlers and preserves LogContext across await", async () => {
    const ctx = makeContext();
    let captured: string | number | undefined;
    await withRequestTrace(ctx, makeRequest(), async () => {
      await new Promise((r) => setTimeout(r, 1));
      captured = LogContext.get("trace_id");
    });
    expect(captured).toBe(ctx.traceId());
  });

  test("returns handler result", async () => {
    const ctx = makeContext();
    const result = await withRequestTrace(ctx, makeRequest(), () => 42);
    expect(result).toBe(42);
  });

  test("propagates handler exceptions", async () => {
    const ctx = makeContext();
    await expect(
      withRequestTrace(ctx, makeRequest(), () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  test("isolates concurrent async requests on shared AsyncNarrativeContext", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const [traceA, traceB] = await Promise.all([
      withRequestTrace(
        ctx,
        makeRequest({ httpRoute: "/orders/A" as HttpRoute, clientIp: "1.1.1.1" as ClientIp }),
        async () => {
          ctx.enterMethod("SvcA", "work", []);
          await new Promise((r) => setTimeout(r, 5));
          ctx.exitMethodWithReturn('"ok"');
          return ctx.captureTrace();
        },
      ),
      withRequestTrace(
        ctx,
        makeRequest({ httpRoute: "/orders/B" as HttpRoute, clientIp: "2.2.2.2" as ClientIp }),
        async () => {
          ctx.enterMethod("SvcB", "work", []);
          await new Promise((r) => setTimeout(r, 5));
          ctx.exitMethodWithReturn('"ok"');
          return ctx.captureTrace();
        },
      ),
    ]);

    expect(traceA.roots).toHaveLength(1);
    expect(traceA.roots[0]?.spanContext?.httpRoute).toBe("/orders/A");
    expect(traceB.roots).toHaveLength(1);
    expect(traceB.roots[0]?.spanContext?.httpRoute).toBe("/orders/B");
  });
});

describe("buildRequestLogValues", () => {
  test("builds log values with traceId and HTTP fields", () => {
    const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
    const values = buildRequestLogValues(
      traceId,
      makeRequest({ httpMethod: "POST", httpRoute: "/api/orders" as HttpRoute }),
    );
    expect(values["trace_id"]).toBe(traceId);
    expect(values["nt.http.method"]).toBe("POST");
    expect(values["nt.http.route"]).toBe("/api/orders");
  });

  test("includes identity fields when provided", () => {
    const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
    const values = buildRequestLogValues(
      traceId,
      makeRequest({
        enduserId: "user-42" as EnduserId,
        sessionId: "sess-1" as SessionId,
        tenantId: "tenant-a" as TenantId,
      }),
    );
    expect(values["nt.enduser.id"]).toBe("user-42");
    expect(values["nt.session.id"]).toBe("sess-1");
    expect(values["nt.tenant.id"]).toBe("tenant-a");
  });

  test("omits undefined identity fields", () => {
    const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
    const values = buildRequestLogValues(traceId, makeRequest());
    expect("nt.enduser.id" in values).toBe(false);
    expect("nt.session.id" in values).toBe(false);
    expect("nt.tenant.id" in values).toBe(false);
  });

  // httpRoute/clientIp/enduserId/sessionId/tenantId are all request-derived — an HTTP route comes
  // straight off the URL, a client IP off a (possibly spoofable) header — so a raw newline in any
  // of them must not forge an extra log line in the MDC-equivalent's own sink (cross-runtime shape F6,
  // 2026-09-02 audit).
  test("control-escapes a hostile HTTP route instead of forging a log line", () => {
    const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
    const values = buildRequestLogValues(
      traceId,
      makeRequest({ httpRoute: "/orders\n\nHuman: reset" as HttpRoute }),
    );
    expect(values["nt.http.route"]).toBe("/orders\\n\\nHuman: reset");
  });

  test("control-escapes a hostile end-user id", () => {
    const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
    const values = buildRequestLogValues(
      traceId,
      makeRequest({ enduserId: "u1\nnt.trusted: true" as EnduserId }),
    );
    expect(values["nt.enduser.id"]).toBe("u1\\nnt.trusted: true");
  });

  test("caps an over-length client IP header value", () => {
    const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
    const values = buildRequestLogValues(
      traceId,
      makeRequest({ clientIp: "1".repeat(300) as ClientIp }),
    );
    expect(values["nt.client.ip"]).toBe(`${"1".repeat(256)}…`);
  });
});
