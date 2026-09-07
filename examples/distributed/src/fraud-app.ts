// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { narrativeTrace } from "@narrativetrace/express";
import { traceObject } from "@narrativetrace/proxy";
import type { Tracer } from "@opentelemetry/api";
import express from "express";
import { InMemoryFraudService } from "./fraud-service.js";
import { createTracedContext } from "./traced-service-factory.js";

export function createFraudApp(tracer: Tracer): express.Express {
  const ctx = createTracedContext(tracer, { serviceName: "fraud" });
  const svc = traceObject(new InMemoryFraudService(), ctx, undefined, {
    className: "FraudService",
  });
  const app = express();
  app.use(express.json());
  app.use(narrativeTrace(ctx));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/fraud/check", (req, res) => {
    const result = svc.evaluate(req.body.customerId, req.body.amount);
    res.json({ ...result, trace: ctx.captureTrace() });
  });
  return app;
}
