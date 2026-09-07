// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFraudApp } from "../src/fraud-app.js";

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

describe("Fraud app", () => {
  test("GET /health returns ok", async () => {
    const app = createFraudApp(provider.getTracer("test"));

    const res = await request(app).get("/health").expect(200);

    expect(res.body).toEqual({ status: "ok" });
  });

  test("POST /fraud/check returns approved for normal customer", async () => {
    const app = createFraudApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/fraud/check")
      .send({ customerId: "C1", amount: 100 })
      .expect(200);

    expect(res.body.approved).toBe(true);
    expect(res.body.riskScore).toBe(0.1);
  });

  test("POST /fraud/check returns rejected for C3", async () => {
    const app = createFraudApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/fraud/check")
      .send({ customerId: "C3", amount: 50 })
      .expect(200);

    expect(res.body.approved).toBe(false);
    expect(res.body.riskScore).toBe(0.9);
  });

  test("POST /fraud/check includes trace in response", async () => {
    const app = createFraudApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/fraud/check")
      .send({ customerId: "C1", amount: 100 })
      .expect(200);

    expect(res.body.trace).toBeDefined();
    expect(res.body.trace.roots).toHaveLength(1);
    expect(res.body.trace.roots[0].signature.className).toBe("FraudService");
  });

  test("trace includes fraud service identity", async () => {
    const app = createFraudApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/fraud/check")
      .send({ customerId: "C1", amount: 100 })
      .expect(200);

    expect(res.body.trace.roots[0].spanContext.serviceName).toBe("fraud");
  });

  test("trace includes HTTP fields from middleware", async () => {
    const app = createFraudApp(provider.getTracer("test"));

    const res = await request(app)
      .post("/fraud/check")
      .send({ customerId: "C1", amount: 100 })
      .expect(200);

    expect(res.body.trace.roots[0].spanContext.httpMethod).toBe("POST");
    expect(res.body.trace.roots[0].spanContext.httpRoute).toBe("/fraud/check");
  });
});
