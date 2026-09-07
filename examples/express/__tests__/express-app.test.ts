// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createExpressApp } from "../src/index.js";

describe("Express example app", () => {
  test("POST /orders returns order result and trace for successful order", async () => {
    const app = createExpressApp();

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 2 })
      .expect(200);

    expect(res.body.order.orderId).toMatch(/^ORD-\d+$/);
    expect(res.body.order.transactionId).toMatch(/^TX-\d+$/);
    expect(res.body.order.totalCharged).toBe(59.98);
    expect(res.body.order.itemCount).toBe(2);

    expect(res.body.trace).toBeDefined();
    expect(res.body.trace.roots).toHaveLength(1);
    expect(res.body.trace.roots[0].signature.className).toBe("OrderService");
    expect(res.body.trace.roots[0].signature.methodName).toBe("placeOrder");

    const children = res.body.trace.roots[0].children;
    expect(children.length).toBeGreaterThanOrEqual(4);
    const classNames = children.map(
      (c: { signature: { className: string } }) => c.signature.className,
    );
    expect(classNames).toContain("CustomerService");
    expect(classNames).toContain("CatalogService");
    expect(classNames).toContain("InventoryService");
    expect(classNames).toContain("PaymentService");

    const rootSpanContext = res.body.trace.roots[0].spanContext;
    expect(rootSpanContext.httpMethod).toBe("POST");
    expect(rootSpanContext.httpRoute).toBe("/orders");
    expect(rootSpanContext.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  test("POST /orders returns 400 with error and trace for unknown customer", async () => {
    const app = createExpressApp();

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "UNKNOWN", productId: "P1", quantity: 1 })
      .expect(400);

    expect(res.body.error).toBe("Customer not found: UNKNOWN");
    expect(res.body.trace).toBeDefined();
    expect(res.body.trace.roots).toHaveLength(1);
    expect(res.body.trace.roots[0].outcome.kind).toBe("threw");
  });

  test("POST /orders returns 400 with error and trace when payment declined", async () => {
    const app = createExpressApp();

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C3", productId: "P1", quantity: 1 })
      .expect(400);

    expect(res.body.error).toBe("Payment declined for customer: C3");
    expect(res.body.trace).toBeDefined();
    expect(res.body.trace.roots).toHaveLength(1);
    expect(res.body.trace.roots[0].outcome.kind).toBe("threw");
  });
});
