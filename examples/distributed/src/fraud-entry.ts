// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { setupOtel } from "./otel-setup.js";

const tracer = setupOtel("fraud", process.env.OTLP_ENDPOINT);

const { createFraudApp } = await import("./fraud-app.js");
createFraudApp(tracer).listen(3004, () => console.log("Fraud → http://localhost:3004"));
