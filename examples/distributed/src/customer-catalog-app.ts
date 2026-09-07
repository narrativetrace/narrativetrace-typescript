// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InMemoryCatalogService, InMemoryCustomerService } from "@narrativetrace/example-ecommerce";
import { narrativeTrace } from "@narrativetrace/express";
import { traceObject } from "@narrativetrace/proxy";
import type { Tracer } from "@opentelemetry/api";
import express from "express";
import { createTracedContext } from "./traced-service-factory.js";

const IDENTITY = { serviceName: "customer-catalog" } as const;

export function createCustomerCatalogApp(tracer: Tracer): express.Express {
  const ctx = createTracedContext(tracer, IDENTITY);
  const customerSvc = traceObject(new InMemoryCustomerService(), ctx, undefined, {
    className: "CustomerService",
  });
  const catalogSvc = traceObject(new InMemoryCatalogService(), ctx, undefined, {
    className: "CatalogService",
  });
  const app = express();
  app.use(express.json());
  app.use(narrativeTrace(ctx));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/customers/:id", (req, res) => {
    try {
      const customer = customerSvc.findCustomer(req.params.id);
      res.json({ customer, trace: ctx.captureTrace() });
    } catch (error) {
      res.status(404).json({ error: (error as Error).message, trace: ctx.captureTrace() });
    }
  });
  app.get("/catalog/:id", (req, res) => {
    try {
      const price = catalogSvc.lookupPrice(req.params.id);
      res.json({ productId: req.params.id, price, trace: ctx.captureTrace() });
    } catch (error) {
      res.status(404).json({ error: (error as Error).message, trace: ctx.captureTrace() });
    }
  });
  return app;
}
