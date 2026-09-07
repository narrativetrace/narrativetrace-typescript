// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import "reflect-metadata";
import { NarrativeStorage } from "@narrativetrace/nestjs";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AppModule } from "../server/app.module.js";

describe("NestJS zero-code tracing example", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors();
    await app.init();
  }, 15000);

  afterAll(async () => {
    await app?.close();
  });

  test("POST /orders returns order with trace", async () => {
    const res = await supertest(app.getHttpServer())
      .post("/orders")
      .send({ customerId: "C-1", productId: "SKU-1", quantity: 2 })
      .expect(200);

    expect(res.body.order.orderId).toMatch(/^ORD-/);
    expect(res.body.order.transactionId).toMatch(/^TXN-/);
    expect(res.body.order.totalCharged).toBe(19.98);
    expect(res.body.trace.roots.length).toBeGreaterThan(0);
  });

  test("POST /orders with invalid quantity returns error with trace", async () => {
    const res = await supertest(app.getHttpServer())
      .post("/orders")
      .send({ customerId: "C-1", productId: "SKU-1", quantity: 0 })
      .expect(400);

    expect(res.body.error).toContain("Quantity");
    expect(res.body.trace.roots).toBeDefined();
  });

  test("POST /orders with unknown product returns error with trace", async () => {
    const res = await supertest(app.getHttpServer())
      .post("/orders")
      .send({ customerId: "C-1", productId: "UNKNOWN", quantity: 1 })
      .expect(400);

    expect(res.body.error).toContain("stock");
    expect(res.body.trace.roots).toBeDefined();
  });

  test("CORS allows traceparent header", async () => {
    const res = await supertest(app.getHttpServer())
      .options("/orders")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "traceparent");

    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-headers"]).toMatch(/traceparent/i);
  });

  test("NarrativeStorage resolves from module", () => {
    const storage = app.get(NarrativeStorage);
    expect(storage).toBeDefined();
  });
});
