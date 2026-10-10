// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { LogContext } from "@narrativetrace/observability";
import { traceObject } from "@narrativetrace/proxy";
import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { addNarrativeTrace } from "./narrative-trace.js";

class OrderService {
  placeOrder(customerId: string, quantity: number): string {
    return `${customerId}:${quantity}`;
  }
}

function orderApp(): Hono {
  const app = new Hono();
  const narrativeContext = addNarrativeTrace(app);
  const orders = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "quantity"],
  });
  app.post("/orders/:customerId", (c) =>
    c.json({ order: orders.placeOrder(c.req.param("customerId"), 2) }),
  );
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
  LogContext.reset();
});

describe("the hono row's wiring snippet", () => {
  test("prints each request's own trace once the handler returns", async () => {
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => printed.push(line));
    const app = orderApp();

    expect((await app.request("/orders/C-1", { method: "POST" })).status).toBe(200);
    expect((await app.request("/orders/C-2", { method: "POST" })).status).toBe(200);

    expect(printed).toHaveLength(2);
    expect(printed[0]).toContain("OrderService.placeOrder(");
    expect(printed[0]).toContain("C-1");
    expect(printed[0]).not.toContain("C-2");
    expect(printed[1]).toContain("C-2");
  });
});
