// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { compose } from "../src/checkout.js";

describe("CheckoutService", () => {
  test("a checkout ends paid, with the invoice it issued", () => {
    const { checkout } = compose();
    const result = checkout.checkout({
      customerId: "C-7",
      lines: [{ sku: "A", priceCents: 1200, quantity: 2 }],
    });
    expect(result).toEqual({ invoiceId: "INV-1001", status: "paid" });
  });

  test("an empty order cannot be authorized", () => {
    const { checkout } = compose();
    expect(() => checkout.checkout({ customerId: "C-7", lines: [] })).toThrow(RangeError);
  });
});
