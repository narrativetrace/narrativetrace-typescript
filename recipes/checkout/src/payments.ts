// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/payments.ts
/** The gateway refused the card. Says nothing about the stock that is still reserved. */
export class PaymentDeclinedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentDeclinedError";
  }
}

/** The card every gateway's test suite declines. Luhn-valid, like a real one. */
export const DECLINING_CARD = "4000000000000002";

/** Charges a card and returns the gateway's payment id. */
export interface PaymentService {
  charge(customerId: string, amountCents: number, card: string): string;
}

/** A card gateway stub: it declines the one test card gateways document as declining. */
export class CardPaymentService implements PaymentService {
  charge(customerId: string, amountCents: number, card: string): string {
    if (card === DECLINING_CARD) {
      throw new PaymentDeclinedError("card declined by the issuer");
    }
    return `PAY-${customerId}-${amountCents}`;
  }
}
