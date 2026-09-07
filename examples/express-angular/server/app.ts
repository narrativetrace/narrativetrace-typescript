// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createTracedServices } from "@narrativetrace/example-ecommerce";
import { narrativeTrace } from "@narrativetrace/express";
import express from "express";

export function createExpressApp(): express.Express {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const orderService = createTracedServices(ctx);
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, traceparent");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(narrativeTrace(ctx));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/orders", (req, res) => {
    const { customerId, productId, quantity } = req.body;
    try {
      const order = orderService.placeOrder(customerId, productId, quantity);
      res.json({ order, trace: ctx.captureTrace() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message, trace: ctx.captureTrace() });
    }
  });
  return app;
}
