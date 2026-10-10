// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createApp } from "./app.js";

// Starts the API, places two orders against it the way a client would, and shuts down.
const server = createApp().listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}/orders`;
  for (const order of [
    { customerId: "C-1", sku: "SKU-KB", quantity: 2 },
    { customerId: "C-2", sku: "SKU-MS", quantity: 1 },
  ]) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(order),
    });
    console.log(response.status, await response.json());
  }
  server.close();
});
