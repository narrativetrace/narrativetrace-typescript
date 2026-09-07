// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createTracedServices } from "@narrativetrace/example-ecommerce";
import { narrativeTrace } from "@narrativetrace/express";
import express from "express";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = path.join(dirname, "index.html");

export function createExpressApp(): express.Express {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const orderService = createTracedServices(ctx);
  const app = express();
  app.use(express.json());
  app.use(narrativeTrace(ctx));
  app.get("/", (_req, res) => res.sendFile(indexHtml));
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
