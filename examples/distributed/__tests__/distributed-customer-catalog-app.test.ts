// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createCustomerCatalogApp } from "../src/customer-catalog-app.js";

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

describe("Customer+Catalog app", () => {
  test("GET /health returns ok", async () => {
    const app = createCustomerCatalogApp(provider.getTracer("test"));

    const res = await request(app).get("/health").expect(200);

    expect(res.body).toEqual({ status: "ok" });
  });

  test("GET /customers/:id returns customer for valid id", async () => {
    const app = createCustomerCatalogApp(provider.getTracer("test"));

    const res = await request(app).get("/customers/C1").expect(200);

    expect(res.body.customer).toEqual({ id: "C1", name: "Alice", tier: "gold" });
  });

  test("GET /customers/:id returns 404 for unknown id", async () => {
    const app = createCustomerCatalogApp(provider.getTracer("test"));

    const res = await request(app).get("/customers/UNKNOWN").expect(404);

    expect(res.body.error).toBe("Customer not found: UNKNOWN");
  });

  test("GET /catalog/:id returns price for valid product", async () => {
    const app = createCustomerCatalogApp(provider.getTracer("test"));

    const res = await request(app).get("/catalog/P1").expect(200);

    expect(res.body.productId).toBe("P1");
    expect(res.body.price).toBe(29.99);
  });

  test("GET /catalog/:id returns 404 for unknown product", async () => {
    const app = createCustomerCatalogApp(provider.getTracer("test"));

    const res = await request(app).get("/catalog/UNKNOWN").expect(404);

    expect(res.body.error).toBe("Product not found: UNKNOWN");
  });

  test("trace includes customer-catalog service identity", async () => {
    const app = createCustomerCatalogApp(provider.getTracer("test"));

    const res = await request(app).get("/customers/C1").expect(200);

    expect(res.body.trace.roots[0].spanContext.serviceName).toBe("customer-catalog");
  });

  test("responses include trace data", async () => {
    const app = createCustomerCatalogApp(provider.getTracer("test"));

    const customerRes = await request(app).get("/customers/C1").expect(200);
    expect(customerRes.body.trace.roots).toHaveLength(1);
    expect(customerRes.body.trace.roots[0].signature.className).toBe("CustomerService");

    const catalogRes = await request(app).get("/catalog/P1").expect(200);
    expect(catalogRes.body.trace.roots).toHaveLength(1);
    expect(catalogRes.body.trace.roots[0].signature.className).toBe("CatalogService");
  });
});
