// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { LogContext } from "@narrativetrace/observability";
import { traceObject } from "@narrativetrace/proxy";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { addNarrativeTrace } from "./narrative-trace.js";

class OrderService {
  placeOrder(customerId: string, quantity: number): string {
    return `${customerId}:${quantity}`;
  }
}

function orderApp(): express.Express {
  const app = express();
  const narrativeContext = addNarrativeTrace(app);
  const orders = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "quantity"],
  });
  app.post("/orders/:customerId", (req, res) => {
    res.json({ order: orders.placeOrder(req.params.customerId, 2) });
  });
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
  LogContext.reset();
});

describe("the express row's wiring snippet", () => {
  test("prints each request's own trace once the response finishes", async () => {
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => printed.push(line));
    const app = orderApp();

    await request(app).post("/orders/C-1").expect(200);
    await request(app).post("/orders/C-2").expect(200);
    await vi.waitFor(() => expect(printed).toHaveLength(2));

    expect(printed[0]).toContain("OrderService.placeOrder(");
    expect(printed[0]).toContain("C-1");
    expect(printed[0]).not.toContain("C-2");
    expect(printed[1]).toContain("C-2");
  });
});
