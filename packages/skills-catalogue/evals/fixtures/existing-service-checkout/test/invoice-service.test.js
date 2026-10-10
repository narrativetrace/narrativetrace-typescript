// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import { InvoiceService } from "../src/invoice-service.js";

test("an invoice carries the order's total in cents", () => {
  const invoice = new InvoiceService().issueInvoice({
    customerId: "C-1",
    lines: [
      { sku: "A", priceCents: 250, quantity: 2 },
      { sku: "B", priceCents: 100, quantity: 1 },
    ],
  });
  expect(invoice).toEqual({ id: "INV-1001", customerId: "C-1", amountCents: 600 });
});
