// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  NarrativeTraceConfig,
  renderMarkdownBody,
  SyncNarrativeContext,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { PaymentService } from "./payment-service.js";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const service = traceObject(new PaymentService(), context, {
  charge: ["customerId", "authToken", "amount"],
  refund: ["customerId", "reference"],
});

service.charge("C-1234", "tok_demo_only", "42.00");
console.log(renderMarkdownBody(context.captureTrace()));
