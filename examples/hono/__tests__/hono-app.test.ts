// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { createHonoApp } from "../src/index.js";

describe("Hono example app", () => {
  test("POST /orders returns order result and trace for successful order", async () => {
    const app = createHonoApp();

    const res = await app.request("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: "C1", productId: "P1", quantity: 2 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.order.orderId).toMatch(/^ORD-\d+$/);
    expect(body.order.transactionId).toMatch(/^TX-\d+$/);
    expect(body.order.totalCharged).toBe(59.98);
    expect(body.order.itemCount).toBe(2);

    expect(body.trace).toBeDefined();
    expect(body.trace.roots).toHaveLength(1);
    expect(body.trace.roots[0].signature.className).toBe("OrderService");
    expect(body.trace.roots[0].signature.methodName).toBe("placeOrder");

    const children = body.trace.roots[0].children;
    expect(children.length).toBeGreaterThanOrEqual(4);
    const classNames = children.map(
      (c: { signature: { className: string } }) => c.signature.className,
    );
    expect(classNames).toContain("CustomerService");
    expect(classNames).toContain("CatalogService");
    expect(classNames).toContain("InventoryService");
    expect(classNames).toContain("PaymentService");

    const rootSpanContext = body.trace.roots[0].spanContext;
    expect(rootSpanContext.httpMethod).toBe("POST");
    expect(rootSpanContext.httpRoute).toBe("/orders");
    expect(rootSpanContext.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  test("POST /orders returns 400 with error and trace for unknown customer", async () => {
    const app = createHonoApp();

    const res = await app.request("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: "UNKNOWN", productId: "P1", quantity: 1 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();

    expect(body.error).toBe("Customer not found: UNKNOWN");
    expect(body.trace).toBeDefined();
    expect(body.trace.roots).toHaveLength(1);
    expect(body.trace.roots[0].outcome.kind).toBe("threw");
  });

  test("POST /orders returns 400 with error and trace when payment declined", async () => {
    const app = createHonoApp();

    const res = await app.request("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: "C3", productId: "P1", quantity: 1 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();

    expect(body.error).toBe("Payment declined for customer: C3");
    expect(body.trace).toBeDefined();
    expect(body.trace.roots).toHaveLength(1);
    expect(body.trace.roots[0].outcome.kind).toBe("threw");
  });

  test("POST /orders returns 400 for malformed JSON body", async () => {
    const app = createHonoApp();

    const res = await app.request("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
