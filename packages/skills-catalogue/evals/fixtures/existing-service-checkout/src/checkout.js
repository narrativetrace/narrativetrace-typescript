// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createCheckout } from "@acme/checkout-kit";
import { CardSettlement } from "./card-settlement.js";
import { CheckoutService } from "./checkout-service.js";
import { InvoiceService } from "./invoice-service.js";
import { LedgerService } from "./ledger-service.js";
import { NotificationService } from "./notification-service.js";
import { PaymentGateway } from "./payment-gateway.js";

const asIs = (service) => service;

/**
 * Wires the checkout as production runs it. `wrap` decorates every collaborator once, as it is
 * built — production passes nothing; the flow test passes NarrativeTrace's traceObject.
 */
export function compose(wrap = asIs) {
  const invoices = wrap(new InvoiceService(), { issueInvoice: ["order"] });
  const gateway = wrap(new PaymentGateway(), {
    authorize: ["invoiceId", "amountCents"],
    confirm: ["authorizationId"],
  });
  const settlement = wrap(new CardSettlement(gateway), { settle: ["authorization"] });
  const notifications = wrap(new NotificationService(), { send: ["customerId", "message"] });
  const ledger = wrap(new LedgerService(), { recordIssued: ["invoiceId", "amountCents"] });
  const kit = createCheckout({ invoices, payments: gateway, settlement, hooks: [] });
  const checkout = wrap(new CheckoutService(kit), { checkout: ["order"] });
  return { checkout, invoices, gateway, settlement, notifications, ledger };
}
