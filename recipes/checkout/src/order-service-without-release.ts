// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/order-service-without-release.ts
import type { InventoryService } from "./inventory.js";
import type { OrderService } from "./order-service.js";
import type { Order, OrderRepository } from "./orders.js";
import type { PaymentService } from "./payments.js";

const UNIT_PRICE_CENTS = 3999;

/**
 * The same checkout with no release path: a declined charge leaves the reservation behind.
 *
 * INTENT: two recipe pages need this code to RUN, not to be described —
 * `documentation/recipes/help-me-debug-and-fix-this-bug.md` (the bug, before its fix) and
 * `documentation/recipes/review-a-refactoring-did-behaviour-change.md` (the refactoring that drops
 * the release call while every test stays green). It is kept beside `DefaultOrderService` rather
 * than reconstructed by a flag, so each page embeds real source and each run is a real run.
 *
 * @llmNote Never the implementation to copy: `DefaultOrderService` is. The tests wrap both under
 * the class name `OrderService`, so one approved baseline is comparable across the two.
 */
export class OrderServiceWithoutRelease implements OrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly orders: OrderRepository,
  ) {}

  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string {
    this.inventory.reserve(sku, quantity);
    const amountCents = UNIT_PRICE_CENTS * quantity;
    this.payments.charge(customerId, amountCents, cardNumber);
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.orders.save(order);
    return orderId;
  }
}
