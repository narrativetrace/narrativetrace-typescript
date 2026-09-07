// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { setupOtel } from "./otel-setup.js";

const tracer = setupOtel("inventory", process.env.OTLP_ENDPOINT);

const { createInventoryApp } = await import("./inventory-app.js");
createInventoryApp(tracer).listen(3002, () => console.log("Inventory → http://localhost:3002"));
