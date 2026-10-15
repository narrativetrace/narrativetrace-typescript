// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { afterEach, describe, expect, test, vi } from "vitest";
import { applyDiscount } from "../src/pricing.js";
import { context, handleRequest } from "../src/request-scope.js";

// Executes the snippets embedded in documentation/llms.txt ("Tracing a request in production" and
// the plain-functions recipe), so a drifting snippet fails here rather than in an adopter's app.
describe("tracing a request in production", () => {
  test("the export sees the request's own spans, captured inside run()", async () => {
    const exported: string[] = [];

    const orderId = await handleRequest("C1", (trace) => exported.push(trace));

    expect(orderId).toBe("ORD-C1-2");
    expect(exported).toHaveLength(1);
    expect(exported[0]).toContain('OrderService.placeOrder(customerId: "C1", quantity: 2)');
  });

  test("captureTrace() outside run() sees none of the request's spans", async () => {
    await handleRequest("C1", () => {});

    expect(context.captureTrace().roots).toEqual([]);
  });

  test("reset() in finally leaves the scope empty even when the export throws", async () => {
    const failing = (): void => {
      throw new Error("exporter down");
    };

    await expect(handleRequest("C1", failing)).rejects.toThrow("exporter down");

    expect(context.captureTrace().roots).toEqual([]);
  });

  test("concurrent requests export only their own spans", async () => {
    const exported: string[] = [];

    await Promise.all(["C1", "C2"].map((id) => handleRequest(id, (t) => exported.push(t))));

    expect(exported).toHaveLength(2);
    expect(exported.filter((trace) => trace.includes('"C1"'))).toHaveLength(1);
    expect(exported.filter((trace) => trace.includes('"C2"'))).toHaveLength(1);
    for (const trace of exported) expect(trace.match(/placeOrder/g)).toHaveLength(1);
  });
});

describe("a module of plain functions", () => {
  test("the exported function is traced under the configured class and parameter names", async () => {
    let rendered = "";
    await context.run(async () => {
      expect(applyDiscount(200, 10)).toBe(180);
      rendered = renderIndentedText(context.captureTrace());
    });

    expect(rendered).toContain("Pricing.applyDiscount(price: 200, percent: 10)");
  });

  test("a call made inside the module by its bare name produces no span of its own", async () => {
    const inner = (value: number): number => value + 1;
    const outer = (value: number): number => inner(value);
    const traced = traceObject({ inner, outer }, context, { className: "Mod" });
    let rendered = "";

    await context.run(async () => {
      traced.outer(1);
      rendered = renderIndentedText(context.captureTrace());
    });

    expect(rendered).toContain("Mod.outer");
    expect(rendered).not.toContain("Mod.inner");
  });
});

describe("sharing one context across bundles", () => {
  afterEach(() => {
    vi.resetModules();
  });

  test("two copies of the module resolve the same context, on every call", async () => {
    vi.resetModules();
    const first = await import("../src/shared-context.js?first");
    const second = await import("../src/shared-context.js?second");
    expect(first).not.toBe(second);

    const traced = await first.context.run(async () => {
      second.context.enterMethod("Svc", "op", []);
      second.context.exitMethodWithReturn(null);
      return first.context.captureTrace();
    });

    expect(traced.roots).toHaveLength(1);
    expect(traced.roots[0]?.signature.methodName).toBe("op");
  });
});
