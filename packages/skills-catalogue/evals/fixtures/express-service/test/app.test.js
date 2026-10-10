// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";

let server;
let url;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}/orders`;
});

after(() => server.close());

async function post(order) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(order),
  });
  return { status: response.status, body: await response.json() };
}

test("places an order", async () => {
  const { status, body } = await post({ customerId: "C-1", sku: "SKU-KB", quantity: 2 });
  assert.equal(status, 201);
  assert.equal(body.orderId, "ORD-C-1-SKU-KB");
});

test("refuses an order with no items", async () => {
  const { status } = await post({ customerId: "C-1", sku: "SKU-KB", quantity: 0 });
  assert.equal(status, 400);
});
