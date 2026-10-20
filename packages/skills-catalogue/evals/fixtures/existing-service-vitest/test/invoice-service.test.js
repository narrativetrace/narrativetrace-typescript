// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { InvoiceService } from "../src/invoice-service.js";

describe("InvoiceService", () => {
  it("issues an invoice for a positive amount", () => {
    const invoice = new InvoiceService().issueInvoice("C1", 4200, "EUR");
    expect(invoice.id).toBe("INV-C1-4200");
    expect(invoice.currency).toBe("EUR");
  });

  it("refuses a non-positive amount", () => {
    expect(() => new InvoiceService().issueInvoice("C1", 0, "EUR")).toThrow(RangeError);
  });
});
