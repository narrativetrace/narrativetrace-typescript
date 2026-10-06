// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// A deny-listed parameter name (paymentToken) with no test proving redaction — see README.md.
import {
  NarrativeTraceConfig,
  renderMarkdownBody,
  SyncNarrativeContext,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

class PaymentService {
  charge(customerId, _paymentToken, amount) {
    return `CHG-${customerId}-${amount}`;
  }
}

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const service = traceObject(new PaymentService(), context, {
  charge: ["customerId", "paymentToken", "amount"],
});

service.charge("C1", "tok_live_abc123", 42);
console.log(renderMarkdownBody(context.captureTrace()));
