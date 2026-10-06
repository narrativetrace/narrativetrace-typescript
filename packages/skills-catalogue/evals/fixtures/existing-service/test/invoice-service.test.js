// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import assert from "node:assert/strict";
import { test } from "node:test";
import { InvoiceService } from "../src/invoice-service.js";

test("issues an invoice for a positive amount", () => {
  const invoice = new InvoiceService().issueInvoice("C1", 4200, "EUR");
  assert.equal(invoice.id, "INV-C1-4200");
  assert.equal(invoice.currency, "EUR");
});

test("refuses a non-positive amount", () => {
  assert.throws(() => new InvoiceService().issueInvoice("C1", 0, "EUR"), RangeError);
});
