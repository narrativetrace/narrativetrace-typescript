// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// index.test.js
import { renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";

const test = createNarrativeTest();

class PaymentService {
  charge(customerId, paymentToken) {
    return `CHG-${customerId}`;
  }
}

test("redacts a deny-listed parameter", ({ narrativeContext }) => {
  const service = traceObject(new PaymentService(), narrativeContext, {
    charge: ["customerId", "paymentToken"],
  });

  service.charge("C1", "tok_live_51H8x");

  expect(renderMarkdownBody(narrativeContext.captureTrace())).toContain("[REDACTED]");
});
