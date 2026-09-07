// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createInventoryApp } from "../src/inventory-app.js";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
});

afterEach(async () => {
  await provider.shutdown();
});

describe("Inventory app", () => {
  test("GET /health returns ok", async () => {
    const app = createInventoryApp(provider.getTracer("test"));

    const res = await request(app).get("/health").expect(200);

    expect(res.body).toEqual({ status: "ok" });
  });

  test("POST /inventory/reserve returns reservation for valid request", async () => {
    const app = createInventoryApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/inventory/reserve")
      .send({ productId: "P1", quantity: 2 })
      .expect(200);

    expect(res.body.reservation).toEqual({ productId: "P1", quantity: 2 });
  });

  test("POST /inventory/reserve returns 400 for insufficient stock", async () => {
    const app = createInventoryApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/inventory/reserve")
      .send({ productId: "P2", quantity: 999 })
      .expect(400);

    expect(res.body.error).toMatch(/Insufficient stock/);
  });

  test("trace includes inventory service identity", async () => {
    const app = createInventoryApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/inventory/reserve")
      .send({ productId: "P1", quantity: 1 })
      .expect(200);

    expect(res.body.trace.roots[0].spanContext.serviceName).toBe("inventory");
  });

  test("POST /inventory/reserve returns 400 for unknown product", async () => {
    const app = createInventoryApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/inventory/reserve")
      .send({ productId: "UNKNOWN", quantity: 1 })
      .expect(400);

    expect(res.body.error).toBe("Product not found: UNKNOWN");
  });
});
