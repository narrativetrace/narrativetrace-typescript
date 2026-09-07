// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InMemoryInventoryService } from "@narrativetrace/example-ecommerce";
import { narrativeTrace } from "@narrativetrace/express";
import { traceObject } from "@narrativetrace/proxy";
import type { Tracer } from "@opentelemetry/api";
import express from "express";
import { createTracedContext } from "./traced-service-factory.js";

export function createInventoryApp(tracer: Tracer): express.Express {
  const ctx = createTracedContext(tracer, { serviceName: "inventory" });
  const svc = traceObject(new InMemoryInventoryService(), ctx, undefined, {
    className: "InventoryService",
  });
  const app = express();
  app.use(express.json());
  app.use(narrativeTrace(ctx));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/inventory/reserve", (req, res) => {
    try {
      const reservation = svc.reserve(req.body.productId, req.body.quantity);
      res.json({ reservation, trace: ctx.captureTrace() });
    } catch (error) {
      const message = (error as Error).message;
      res.status(400).json({ error: message, trace: ctx.captureTrace() });
    }
  });
  return app;
}
