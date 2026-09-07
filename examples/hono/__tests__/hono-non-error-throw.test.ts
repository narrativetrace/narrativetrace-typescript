// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test, vi } from "vitest";

vi.mock("@narrativetrace/example-ecommerce", () => ({
  createTracedServices: () => ({
    placeOrder() {
      throw "string-error";
    },
  }),
}));

import { createHonoApp } from "../src/app.js";

test("hono handles non-Error thrown values", async () => {
  const app = createHonoApp();

  const res = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId: "C1", productId: "P1", quantity: 1 }),
  });

  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toBe("string-error");
});
