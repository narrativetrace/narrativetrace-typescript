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
import { createPaymentApp } from "../src/payment-app.js";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;
let mockFraudServer: Server;
let mockFraudUrl: string;

function createMockFraudServer(approve: boolean): express.Express {
  const app = express();
  app.use(express.json());
  app.post("/fraud/check", (_req, res) => {
    res.json({
      approved: approve,
      riskScore: approve ? 0.1 : 0.9,
      trace: { roots: [] },
    });
  });
  return app;
}

beforeEach(async () => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
});

afterEach(async () => {
  await provider.shutdown();
  if (mockFraudServer) {
    await new Promise<void>((resolve) => mockFraudServer.close(() => resolve()));
  }
});

describe("Payment app", () => {
  test("GET /health returns ok", async () => {
    const app = createPaymentApp(provider.getTracer("test"), { fraudUrl: "http://unused" });

    const res = await request(app).get("/health").expect(200);

    expect(res.body).toEqual({ status: "ok" });
  });

  test("POST /payments/charge returns confirmation when fraud approves", async () => {
    mockFraudServer = createMockFraudServer(true).listen(0);
    const port = (mockFraudServer.address() as AddressInfo).port;
    mockFraudUrl = `http://localhost:${port}`;
    const app = createPaymentApp(provider.getTracer("test"), { fraudUrl: mockFraudUrl });

    const res = await request(app)
      .post("/payments/charge")
      .send({ customerId: "C1", amount: 100 })
      .expect(200);

    expect(res.body.confirmation.transactionId).toMatch(/^TX-/);
    expect(res.body.confirmation.amount).toBe(100);
  });

  test("POST /payments/charge returns 400 when fraud rejects", async () => {
    mockFraudServer = createMockFraudServer(false).listen(0);
    const port = (mockFraudServer.address() as AddressInfo).port;
    mockFraudUrl = `http://localhost:${port}`;
    const app = createPaymentApp(provider.getTracer("test"), { fraudUrl: mockFraudUrl });

    const res = await request(app)
      .post("/payments/charge")
      .send({ customerId: "C1", amount: 100 })
      .expect(400);

    expect(res.body.error).toBe("Fraud check rejected");
  });

  test("trace includes payment service identity", async () => {
    mockFraudServer = createMockFraudServer(true).listen(0);
    const port = (mockFraudServer.address() as AddressInfo).port;
    mockFraudUrl = `http://localhost:${port}`;
    const app = createPaymentApp(provider.getTracer("test"), { fraudUrl: mockFraudUrl });

    const res = await request(app)
      .post("/payments/charge")
      .send({ customerId: "C1", amount: 100 })
      .expect(200);

    expect(res.body.trace.roots[0].spanContext.serviceName).toBe("payment");
  });

  test("POST /payments/charge returns 400 for C3 payment decline", async () => {
    mockFraudServer = createMockFraudServer(true).listen(0);
    const port = (mockFraudServer.address() as AddressInfo).port;
    mockFraudUrl = `http://localhost:${port}`;
    const app = createPaymentApp(provider.getTracer("test"), { fraudUrl: mockFraudUrl });

    const res = await request(app)
      .post("/payments/charge")
      .send({ customerId: "C3", amount: 100 })
      .expect(400);

    expect(res.body.error).toBe("Payment declined for customer: C3");
  });
});
