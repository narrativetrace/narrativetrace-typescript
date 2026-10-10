// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { compose } from "../src/checkout.js";

describe("CheckoutService", () => {
  test("a euro card is charged the invoice as issued", () => {
    const { checkout } = compose();
    const result = checkout.checkout({
      customerId: "C-7",
      currency: "EUR",
      lines: [{ sku: "A", priceCents: 1200, quantity: 2 }],
    });
    expect(result).toEqual({
      invoiceId: "INV-1001",
      chargedCents: 2400,
      currency: "EUR",
      status: "paid",
    });
  });

  test("a franc card is charged in francs", () => {
    const { checkout } = compose();
    const result = checkout.checkout({
      customerId: "C-2041",
      currency: "EUR",
      lines: [{ sku: "A", priceCents: 5000, quantity: 2 }],
    });
    expect(result).toMatchObject({ chargedCents: 9300, currency: "CHF", status: "paid" });
  });
});
