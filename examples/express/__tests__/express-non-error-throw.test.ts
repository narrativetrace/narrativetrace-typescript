// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import request from "supertest";
import { expect, test, vi } from "vitest";

vi.mock("@narrativetrace/example-ecommerce", () => ({
  createTracedServices: () => ({
    placeOrder() {
      throw "string-error";
    },
  }),
}));

import { createExpressApp } from "../src/app.js";

test("express handles non-Error thrown values", async () => {
  const app = createExpressApp();

  const res = await request(app)
    .post("/orders")
    .send({ customerId: "C1", productId: "P1", quantity: 1 })
    .expect(400);

  expect(res.body.error).toBe("string-error");
});
