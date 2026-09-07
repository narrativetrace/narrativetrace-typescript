// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InMemoryPaymentService } from "@narrativetrace/example-ecommerce";
import { narrativeTrace } from "@narrativetrace/express";
import { traceObject } from "@narrativetrace/proxy";
import type { Tracer } from "@opentelemetry/api";
import express from "express";
import { createTracedContext } from "./traced-service-factory.js";

export interface PaymentAppOptions {
  fraudUrl: string;
}

async function checkFraud(fraudUrl: string, customerId: string, amount: number): Promise<boolean> {
  const res = await fetch(`${fraudUrl}/fraud/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, amount }),
  });
  const result = await res.json();
  return result.approved;
}

export function createPaymentApp(tracer: Tracer, options: PaymentAppOptions): express.Express {
  const ctx = createTracedContext(tracer, { serviceName: "payment" });
  const paymentSvc = traceObject(new InMemoryPaymentService(), ctx, undefined, {
    className: "PaymentService",
  });
  const app = express();
  app.use(express.json());
  app.use(narrativeTrace(ctx));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/payments/charge", async (req, res) => {
    try {
      const approved = await checkFraud(options.fraudUrl, req.body.customerId, req.body.amount);
      if (!approved) throw new Error("Fraud check rejected");
      const confirmation = paymentSvc.charge(req.body.customerId, req.body.amount);
      res.json({ confirmation, trace: ctx.captureTrace() });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message, trace: ctx.captureTrace() });
    }
  });
  return app;
}
