// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import path from "node:path";
import { fileURLToPath } from "node:url";
import { narrativeTrace } from "@narrativetrace/express";
import { traceObject } from "@narrativetrace/proxy";
import type { Tracer } from "@opentelemetry/api";
import express from "express";
import { createTracedContext } from "./traced-service-factory.js";

export interface GatewayAppOptions {
  customerCatalogUrl: string;
  inventoryUrl: string;
  paymentUrl: string;
}

type OrderInput = { customerId: string; productId: string; quantity: number };

class DownstreamError extends Error {
  constructor(readonly downstream: string) {
    super(downstream);
  }
}

async function getJson(url: string) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new DownstreamError(body.error);
  return body;
}

async function postJson(url: string, payload: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new DownstreamError(body.error);
  return body;
}

class GatewayOrchestrator {
  constructor(private readonly options: GatewayAppOptions) {}

  async lookupPriceTotal(order: OrderInput): Promise<number> {
    const { customerCatalogUrl } = this.options;
    await getJson(`${customerCatalogUrl}/customers/${order.customerId}`);
    const catalog = await getJson(`${customerCatalogUrl}/catalog/${order.productId}`);
    return catalog.price * order.quantity;
  }

  async reserveAndCharge(order: OrderInput, totalAmount: number): Promise<string> {
    await postJson(`${this.options.inventoryUrl}/inventory/reserve`, {
      productId: order.productId,
      quantity: order.quantity,
    });
    const payment = await postJson(`${this.options.paymentUrl}/payments/charge`, {
      customerId: order.customerId,
      amount: totalAmount,
    });
    return payment.confirmation.transactionId as string;
  }
}

const IDENTITY = { serviceName: "api-gateway" } as const;

export function createGatewayApp(tracer: Tracer, options: GatewayAppOptions): express.Express {
  const ctx = createTracedContext(tracer, IDENTITY);
  const orchestrator = traceObject(new GatewayOrchestrator(options), ctx, undefined, {
    className: "GatewayOrchestrator",
  });
  const app = express();
  app.use(express.json());
  app.use(narrativeTrace(ctx));
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/", (_req, res) => res.sendFile(path.join(dirname, "index.html")));
  app.post("/orders", async (req, res) => {
    const order: OrderInput = req.body;
    try {
      const totalAmount = await orchestrator.lookupPriceTotal(order);
      const transactionId = await orchestrator.reserveAndCharge(order, totalAmount);
      const result = { ...order, totalCharged: totalAmount, transactionId };
      res.json({ order: result, trace: ctx.captureTrace() });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message, trace: ctx.captureTrace() });
    }
  });
  return app;
}
