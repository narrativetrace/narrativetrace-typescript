// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core";
import { expect, test } from "vitest";
import { createTracedOrderService } from "../src/traced-services.js";

function traceOf(customerId: string, productId: string, quantity: number): string {
  const { orderService, narrativeContext } = createTracedOrderService();
  try {
    orderService.placeOrder(customerId, productId, quantity);
  } catch {
    // the failure scenarios are the point
  }
  return renderIndentedText(narrativeContext.captureTrace());
}

test("parameters carry their declared names, not positional placeholders", () => {
  const text = traceOf("C1", "P1", 2);
  expect(text).toContain('placeOrder(customerId: "C1", productId: "P1", quantity: 2)');
  expect(text).not.toContain("arg0");
});

test("the card token never reaches the trace", () => {
  const text = traceOf("C1", "P1", 2);
  expect(text).toContain("cardToken: [REDACTED]");
  expect(text).not.toContain("tok_");
});

test("placeOrder narrates its intent with the @narrated template on its span", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  orderService.placeOrder("C1", "P1", 2);
  const root = narrativeContext.captureTrace().roots[0];
  expect(root?.signature.narration).toBe("Placing order of 2 P1 for customer C1");
});

test("a declined payment carries the @onError narration with the amount", () => {
  expect(traceOf("C3", "P2", 3)).toContain("Payment declined for customer C3, amount was 149.97");
});

test("an unknown customer carries the @onError narration", () => {
  expect(traceOf("C-UNKNOWN", "P1", 1)).toContain("Customer C-UNKNOWN not found");
});

test("an out-of-stock reservation carries the @onError narration", () => {
  expect(traceOf("C1", "P3", 9999)).toContain("Insufficient stock for P3, requested 9999");
});
