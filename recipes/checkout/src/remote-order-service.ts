// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/remote-order-service.ts
import type { RemotePaymentService } from "./http-payment-service.js";
import type { InventoryService } from "./inventory.js";
import type { Order, OrderRepository } from "./orders.js";
import { PaymentDeclinedError } from "./payments.js";

const UNIT_PRICE_CENTS = 3999;

/** Places an order whose payment is a remote call, and resolves to its id. */
export interface RemoteOrderService {
  placeOrder(
    customerId: string,
    sku: string,
    quantity: number,
    cardNumber: string,
  ): Promise<string>;
}

/**
 * The checkout when the card is charged by another service: reserve, charge over the wire, save —
 * and release on a decline, like `DefaultOrderService`.
 *
 * @llmNote Only the `await` differs from `DefaultOrderService`; the flow, the price and the order
 * id are the same, so the two read as one checkout in a trace.
 */
export class DefaultRemoteOrderService implements RemoteOrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: RemotePaymentService,
    private readonly orders: OrderRepository,
  ) {}

  async placeOrder(
    customerId: string,
    sku: string,
    quantity: number,
    cardNumber: string,
  ): Promise<string> {
    this.inventory.reserve(sku, quantity);
    const amountCents = UNIT_PRICE_CENTS * quantity;
    try {
      await this.payments.charge(customerId, amountCents, cardNumber);
    } catch (error) {
      if (error instanceof PaymentDeclinedError) {
        this.inventory.release(sku, quantity);
      }
      throw error;
    }
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.orders.save(order);
    return orderId;
  }
}
