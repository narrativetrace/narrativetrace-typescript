// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  AsyncNarrativeContext,
  NarrativeTraceConfig,
  tracedFetch,
} from "@narrativetrace/core-node";
import { LogContext } from "@narrativetrace/observability";
import { traceObject } from "@narrativetrace/proxy";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { narrativeTrace } from "../src/narrative-trace-middleware.js";

// Parity check C2 (2026-10-11): an OUTBOUND HTTP call made from traced code carries the current
// traceparent to the callee. Checkout shape: the order endpoint calls the inventory service.
const CALLER_TRACE_ID = "aabbccdd11223344aabbccdd11223344";

class InventoryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetch: typeof globalThis.fetch,
  ) {}

  async reserve(_sku: string, _quantity: number): Promise<number> {
    const response = await this.fetch(`${this.baseUrl}/reserve`, { method: "POST" });
    return response.status;
  }
}

let inventory: Server;
let calleeHits: number;
let receivedTraceparent: string | string[] | undefined;

beforeEach(async () => {
  calleeHits = 0;
  receivedTraceparent = undefined;
  inventory = createServer((req, res) => {
    calleeHits++;
    receivedTraceparent = req.headers.traceparent;
    res.end("reserved");
  });
  await new Promise<void>((resolve) => inventory.listen(0, "127.0.0.1", resolve));
});

afterEach(async () => {
  LogContext.reset();
  await new Promise((resolve) => inventory.close(resolve));
});

function orderApp(ctx: AsyncNarrativeContext) {
  const { port } = inventory.address() as AddressInfo;
  const client = traceObject(
    new InventoryClient(`http://127.0.0.1:${port}`, tracedFetch(ctx)),
    ctx,
    {
      reserve: ["sku", "quantity"],
    },
  );
  const app = express();
  app.use(narrativeTrace(ctx));
  app.post("/orders", async (_req, res) => {
    res.json({ status: await client.reserve("P1", 2) });
  });
  return app;
}

describe("outbound HTTP from traced code", () => {
  test("the callee receives a traceparent continuing the caller's trace id", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    await request(orderApp(ctx))
      .post("/orders")
      .set("traceparent", `00-${CALLER_TRACE_ID}-00f067aa0ba902b7-01`)
      .expect(200);

    expect(calleeHits).toBe(1); // the call reached the callee: only the header is in question
    expect(String(receivedTraceparent)).toMatch(new RegExp(`^00-${CALLER_TRACE_ID}-[0-9a-f]{16}-`));
  });
});
