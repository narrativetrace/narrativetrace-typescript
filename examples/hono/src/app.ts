// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";
import { createTracedServices } from "@narrativetrace/example-ecommerce";
import { createHonoNarrativeContext, narrativeTrace } from "@narrativetrace/hono";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import type { Context } from "hono";
import { Hono } from "hono";
import pino from "pino";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.join(dirname, "index.html"), "utf-8");

// Real logger destination for the trace — documentation/framework-integration-guide.md § 9
// (Winston & Pino). BufferedEventConsumer stays wired so ctx.captureTrace() below still works.
const logger = pino();
const pinoConsumer = createPinoEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});
const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
const ctx = createHonoNarrativeContext(new NarrativeTraceConfig("detail"), { pipeline });
const orderService = createTracedServices(ctx);

async function handleOrder(c: Context): Promise<Response> {
  try {
    const { customerId, productId, quantity } = await c.req.json();
    const order = orderService.placeOrder(customerId, productId, quantity);
    return c.json({ order, trace: ctx.captureTrace() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message, trace: ctx.captureTrace() }, 400);
  }
}

export function createHonoApp(): Hono {
  const app = new Hono();
  app.use(narrativeTrace(ctx));
  app.get("/", (c) => c.html(indexHtml));
  app.post("/orders", handleOrder);
  return app;
}
