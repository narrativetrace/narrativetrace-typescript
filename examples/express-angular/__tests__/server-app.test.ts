// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createExpressApp } from "../server/app.js";

describe("Express backend", () => {
  test("POST /orders returns order result and trace", async () => {
    const app = createExpressApp();
    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 2 })
      .expect(200);

    expect(res.body.order.orderId).toMatch(/^ORD-\d+$/);
    expect(res.body.order.totalCharged).toBe(59.98);
    expect(res.body.trace).toBeDefined();
    expect(res.body.trace.roots).toHaveLength(1);
  });

  test("POST /orders returns 400 for payment declined", async () => {
    const app = createExpressApp();
    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C3", productId: "P1", quantity: 1 })
      .expect(400);

    expect(res.body.error).toBe("Payment declined for customer: C3");
    expect(res.body.trace).toBeDefined();
  });

  test("CORS headers are present on responses", async () => {
    const app = createExpressApp();
    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 1 });

    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  test("OPTIONS preflight returns 204 with CORS headers", async () => {
    const app = createExpressApp();
    const res = await request(app).options("/orders").expect(204);

    expect(res.headers["access-control-allow-headers"]).toContain("traceparent");
  });
});
