// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";
import { createTracedServices } from "@narrativetrace/example-ecommerce";
import { createExpressNarrativeContext, narrativeTrace } from "@narrativetrace/express";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import express from "express";
import pino from "pino";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = path.join(dirname, "index.html");

export function createExpressApp(): express.Express {
  // Real logger destination for the trace — documentation/framework-integration-guide.md § 9
  // (Winston & Pino). BufferedEventConsumer stays wired so ctx.captureTrace() below still works.
  const logger = pino();
  const pinoConsumer = createPinoEventConsumer(logger, {
    levels: { enter: "info", return: "info", exception: "error" },
  });
  const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
  const ctx = createExpressNarrativeContext(new NarrativeTraceConfig("detail"), { pipeline });
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
