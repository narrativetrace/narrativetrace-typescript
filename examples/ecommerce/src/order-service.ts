// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { narrated, traced } from "@narrativetrace/proxy";
import type { ProductCatalogService } from "./catalog-service.js";
import type { CustomerService } from "./customer-service.js";
import type { OrderResult } from "./domain.js";
import type { InventoryService } from "./inventory-service.js";
import type { PaymentService } from "./payment-service.js";

export interface OrderService {
  placeOrder(customerId: string, productId: string, quantity: number): OrderResult;
}

export class DefaultOrderService implements OrderService {
  private orderCounter = 0;

  constructor(
    private readonly customers: CustomerService,
    private readonly catalog: ProductCatalogService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
  ) {}

  @traced("customerId", "productId", "quantity")
  @narrated("Placing order of {quantity} {productId} for customer {customerId}")
  placeOrder(customerId: string, productId: string, quantity: number): OrderResult {
    if (quantity < 1) throw new Error("Quantity must be at least 1");
    const customer = this.customers.findCustomer(customerId);
    const price = this.catalog.lookupPrice(productId);
    this.inventory.reserve(productId, quantity);
    const totalAmount = Math.round(price * quantity * 100) / 100;
    const confirmation = this.payments.charge(customerId, totalAmount, `tok_${customer.id}`);
    this.orderCounter++;
    return {
      orderId: `ORD-${this.orderCounter}`,
      transactionId: confirmation.transactionId,
      totalCharged: totalAmount,
      itemCount: quantity,
    };
  }
}
