// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createTracedServices } from "@narrativetrace/example-ecommerce";
import { narrativeTrace } from "@narrativetrace/hono";
import type { Context } from "hono";
import { Hono } from "hono";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.join(dirname, "index.html"), "utf-8");

const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
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
