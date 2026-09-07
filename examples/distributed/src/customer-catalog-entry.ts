// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { setupOtel } from "./otel-setup.js";

const tracer = setupOtel("customer-catalog", process.env.OTLP_ENDPOINT);

const { createCustomerCatalogApp } = await import("./customer-catalog-app.js");
createCustomerCatalogApp(tracer).listen(3001, () =>
  console.log("Customer+Catalog → http://localhost:3001"),
);
