// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { CardSettlement } from "./card-settlement.js";
import { CheckoutService } from "./checkout-service.js";
import { CustomerDirectory } from "./customer-directory.js";
import { DailyRates } from "./daily-rates.js";
import { InvoiceService } from "./invoice-service.js";
import { PaymentGateway } from "./payment-gateway.js";
import { RateTableConverter } from "./rate-table-converter.js";

const asIs = (service) => service;

/**
 * Wires the checkout as production runs it. `wrap` decorates every collaborator once, as it is
 * built — production passes nothing; the flow test passes NarrativeTrace's traceObject.
 */
export function compose(wrap = asIs) {
  const invoices = wrap(new InvoiceService(), { issueInvoice: ["order"] });
  const customers = wrap(new CustomerDirectory(), { cardCurrencyOf: ["customerId"] });
  const rates = wrap(new DailyRates(), { rateFor: ["from", "to"] });
  const converter = wrap(new RateTableConverter(rates), { convert: ["amountCents", "from", "to"] });
  const gateway = wrap(new PaymentGateway(), {
    authorize: ["invoiceId", "amountCents", "currency"],
    confirm: ["authorizationId"],
  });
  const settlement = wrap(new CardSettlement(gateway), { settle: ["authorization"] });
  const checkout = wrap(
    new CheckoutService({ invoices, customers, converter, gateway, settlement }),
    { checkout: ["order"] },
  );
  return { checkout, invoices, customers, rates, converter, gateway, settlement };
}
