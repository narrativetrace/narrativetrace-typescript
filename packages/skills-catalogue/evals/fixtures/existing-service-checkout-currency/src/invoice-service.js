// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Issues one invoice per order: the amount is the order's lines, in cents of the order's currency. */
export class InvoiceService {
  next = 1000;

  issueInvoice(order) {
    const amountCents = order.lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
    return {
      id: `INV-${++this.next}`,
      customerId: order.customerId,
      amountCents,
      currency: order.currency,
    };
  }
}
