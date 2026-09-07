// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { notTraced, onError, traced } from "@narrativetrace/proxy";
import type { PaymentConfirmation } from "./domain.js";

export interface PaymentService {
  /**
   * `cardToken` is a secret: the traced implementation redacts it with `@notTraced(2)`. Optional so
   * consumers that hold no token (the express/hono/distributed apps) can still charge.
   */
  charge(customerId: string, amount: number, cardToken?: string): PaymentConfirmation;
}

export class InMemoryPaymentService implements PaymentService {
  private txCounter = 0;

  @traced("customerId", "amount", "cardToken")
  @notTraced(2)
  @onError("Payment declined for customer {customerId}, amount was {amount}")
  charge(customerId: string, amount: number, _cardToken?: string): PaymentConfirmation {
    if (customerId === "C3") {
      throw new Error(`Payment declined for customer: ${customerId}`);
    }
    this.txCounter++;
    return { transactionId: `TX-${this.txCounter}`, amount };
  }
}
