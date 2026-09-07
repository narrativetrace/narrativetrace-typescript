// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { setupOtel } from "./otel-setup.js";

const tracer = setupOtel("payment", process.env.OTLP_ENDPOINT);

const { createPaymentApp } = await import("./payment-app.js");
createPaymentApp(tracer, {
  fraudUrl: process.env.FRAUD_URL ?? "http://localhost:3004",
}).listen(3003, () => console.log("Payment → http://localhost:3003"));
