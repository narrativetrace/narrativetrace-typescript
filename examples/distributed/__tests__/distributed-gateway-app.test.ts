// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createGatewayApp } from "../src/gateway-app.js";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;
const servers: Server[] = [];

function startMockServer(app: express.Express): string {
  const server = app.listen(0);
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return `http://localhost:${port}`;
}

function createMockCustomerCatalog(): express.Express {
  const app = express();
  app.get("/customers/:id", (req, res) => {
    if (req.params.id === "UNKNOWN") {
      res.status(404).json({ error: "Customer not found: UNKNOWN" });
      return;
    }
    res.json({ customer: { id: req.params.id, name: "Alice", tier: "gold" } });
  });
  app.get("/catalog/:id", (req, res) => {
    res.json({ productId: req.params.id, price: 29.99 });
  });
  return app;
}

function createMockInventory(): express.Express {
  const app = express();
  app.use(express.json());
  app.post("/inventory/reserve", (req, res) => {
    res.json({ reservation: { productId: req.body.productId, quantity: req.body.quantity } });
  });
  return app;
}

function createMockPayment(succeed: boolean): express.Express {
  const app = express();
  app.use(express.json());
  app.post("/payments/charge", (_req, res) => {
    if (succeed) {
      res.json({ confirmation: { transactionId: "TX-1", amount: 29.99 } });
    } else {
      res.status(400).json({ error: "Payment declined" });
    }
  });
  return app;
}

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
});

afterEach(async () => {
  await provider.shutdown();
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  servers.length = 0;
});

describe("Gateway app", () => {
  test("GET /health returns ok", async () => {
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl: "http://unused",
      inventoryUrl: "http://unused",
      paymentUrl: "http://unused",
    });

    const res = await request(app).get("/health").expect(200);

    expect(res.body).toEqual({ status: "ok" });
  });

  test("POST /orders returns order result for valid request", async () => {
    const customerCatalogUrl = startMockServer(createMockCustomerCatalog());
    const inventoryUrl = startMockServer(createMockInventory());
    const paymentUrl = startMockServer(createMockPayment(true));
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl,
      inventoryUrl,
      paymentUrl,
    });

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 1 })
      .expect(200);

    expect(res.body.order.customerId).toBe("C1");
    expect(res.body.order.productId).toBe("P1");
    expect(res.body.order.totalCharged).toBe(29.99);
  });

  test("POST /orders returns 400 for unknown customer", async () => {
    const customerCatalogUrl = startMockServer(createMockCustomerCatalog());
    const inventoryUrl = startMockServer(createMockInventory());
    const paymentUrl = startMockServer(createMockPayment(true));
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl,
      inventoryUrl,
      paymentUrl,
    });

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "UNKNOWN", productId: "P1", quantity: 1 })
      .expect(400);

    expect(res.body.error).toBe("Customer not found: UNKNOWN");
  });

  test("POST /orders returns 400 for payment failure", async () => {
    const customerCatalogUrl = startMockServer(createMockCustomerCatalog());
    const inventoryUrl = startMockServer(createMockInventory());
    const paymentUrl = startMockServer(createMockPayment(false));
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl,
      inventoryUrl,
      paymentUrl,
    });

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 1 })
      .expect(400);

    expect(res.body.error).toBe("Payment declined");
  });

  test("successful order includes trace with GatewayOrchestrator spans", async () => {
    const customerCatalogUrl = startMockServer(createMockCustomerCatalog());
    const inventoryUrl = startMockServer(createMockInventory());
    const paymentUrl = startMockServer(createMockPayment(true));
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl,
      inventoryUrl,
      paymentUrl,
    });

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 1 })
      .expect(200);

    expect(res.body.trace).toBeDefined();
    const classNames = res.body.trace.roots.map(
      (r: { signature: { className: string } }) => r.signature.className,
    );
    expect(classNames).toEqual(["GatewayOrchestrator", "GatewayOrchestrator"]);
  });

  test("error response includes trace data", async () => {
    const customerCatalogUrl = startMockServer(createMockCustomerCatalog());
    const inventoryUrl = startMockServer(createMockInventory());
    const paymentUrl = startMockServer(createMockPayment(false));
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl,
      inventoryUrl,
      paymentUrl,
    });

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 1 })
      .expect(400);

    expect(res.body.trace).toBeDefined();
    expect(res.body.error).toBe("Payment declined");
  });

  test("trace includes api-gateway service identity", async () => {
    const customerCatalogUrl = startMockServer(createMockCustomerCatalog());
    const inventoryUrl = startMockServer(createMockInventory());
    const paymentUrl = startMockServer(createMockPayment(true));
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl,
      inventoryUrl,
      paymentUrl,
    });

    const res = await request(app)
      .post("/orders")
      .send({ customerId: "C1", productId: "P1", quantity: 1 })
      .expect(200);

    for (const root of res.body.trace.roots) {
      expect(root.spanContext.serviceName).toBe("api-gateway");
    }
  });

  test("GET / serves HTML page", async () => {
    const customerCatalogUrl = startMockServer(createMockCustomerCatalog());
    const inventoryUrl = startMockServer(createMockInventory());
    const paymentUrl = startMockServer(createMockPayment(true));
    const app = createGatewayApp(provider.getTracer("test"), {
      customerCatalogUrl,
      inventoryUrl,
      paymentUrl,
    });

    const res = await request(app).get("/").expect(200);

    expect(res.text).toContain("<html");
  });
});
