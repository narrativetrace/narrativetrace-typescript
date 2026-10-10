// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Checks an order out in the customer's card currency: invoice, convert, authorize, settle. */
export class CheckoutService {
  constructor({ invoices, customers, converter, gateway, settlement }) {
    Object.assign(this, { invoices, customers, converter, gateway, settlement });
  }

  checkout(order) {
    const invoice = this.invoices.issueInvoice(order);
    const currency = this.customers.cardCurrencyOf(order.customerId);
    const chargeCents = this.converter.convert(invoice.amountCents, invoice.currency, currency);
    const authorization = this.gateway.authorize(invoice.id, chargeCents, currency);
    const settled = this.settlement.settle(authorization);
    return { invoiceId: invoice.id, chargedCents: chargeCents, currency, status: settled.status };
  }
}
