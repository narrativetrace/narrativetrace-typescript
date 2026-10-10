// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NarrativeTraceConfig,
  RedactionPolicy,
  renderMarkdownBody,
  SyncNarrativeContext,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { PaymentService } from "../src/payment-service.js";

test("the auth token is redacted and the other arguments survive", () => {
  const context = new SyncNarrativeContext(new NarrativeTraceConfig());
  const service = traceObject(new PaymentService(), context, {
    charge: ["customerId", "authToken", "amount"],
  });

  service.charge("C-1234", "tok_demo_only", "42.00");
  const rendered = renderMarkdownBody(context.captureTrace());

  assert.ok(rendered.includes(RedactionPolicy.MARKER));
  assert.ok(!rendered.includes("tok_demo_only"));
  assert.ok(rendered.includes("C-1234"));
});
