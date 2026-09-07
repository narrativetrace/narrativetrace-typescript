// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { setupOtel } from "./otel-setup.js";

const tracer = setupOtel("api-gateway", process.env.OTLP_ENDPOINT);

const { createGatewayApp } = await import("./gateway-app.js");
createGatewayApp(tracer, {
  customerCatalogUrl: process.env.CUSTOMER_CATALOG_URL ?? "http://localhost:3001",
  inventoryUrl: process.env.INVENTORY_URL ?? "http://localhost:3002",
  paymentUrl: process.env.PAYMENT_URL ?? "http://localhost:3003",
}).listen(3000, () => console.log("Gateway → http://localhost:3000"));
