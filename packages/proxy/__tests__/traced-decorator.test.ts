// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { notTraced } from "../src/not-traced.js";
import { traceObject } from "../src/trace-object.js";
import { traced } from "../src/traced.js";

describe("@traced decorator", () => {
  test("provides parameter names to traceObject", () => {
    class OrderService {
      @traced("orderId", "quantity")
      placeOrder(orderId: string, _quantity: number): string {
        return `placed-${orderId}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new OrderService(), ctx);

    svc.placeOrder("abc", 5);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    const params = tree.roots[0]?.signature.parameters;
    expect(params).toHaveLength(2);
    expect(params?.[0]?.name).toBe("orderId");
    expect(params?.[1]?.name).toBe("quantity");
  });

  test("falls back to arg0/arg1 when no decorator and no paramNames map", () => {
    class Svc {
      doStuff(a: string, b: number): string {
        return `${a}-${b}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new Svc(), ctx);
    svc.doStuff("x", 1);
    const params = ctx.captureTrace().roots[0]?.signature.parameters;
    expect(params?.[0]?.name).toBe("arg0");
    expect(params?.[1]?.name).toBe("arg1");
  });

  test("paramNames map takes precedence over @traced decorator", () => {
    class Svc {
      @traced("decoratorName")
      op(x: string): string {
        return x;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new Svc(), ctx, { op: ["mapName"] });
    svc.op("val");
    const params = ctx.captureTrace().roots[0]?.signature.parameters;
    expect(params?.[0]?.name).toBe("mapName");
  });

  test("@traced combines with @notTraced for redacted params", () => {
    class AuthService {
      @traced("username", "password")
      @notTraced(1)
      login(username: string, _password: string): boolean {
        return username === "admin";
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new AuthService(), ctx);
    svc.login("admin", "secret123");
    const params = ctx.captureTrace().roots[0]?.signature.parameters;
    expect(params?.[0]?.name).toBe("username");
    expect(params?.[0]?.renderedValue).toBe('"admin"');
    expect(params?.[0]?.redacted).toBe(false);
    expect(params?.[1]?.name).toBe("password");
    expect(params?.[1]?.renderedValue).toBe("[REDACTED]");
    expect(params?.[1]?.redacted).toBe(true);
  });
});
