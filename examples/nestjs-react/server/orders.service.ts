// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Injectable } from "@nestjs/common";
import { InventoryService } from "./inventory.service.js";
import { PaymentService } from "./payment.service.js";

@Injectable()
export class OrdersService {
  private orderCounter = 0;

  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
  ) {}

  placeOrder(customerId: string, productId: string, quantity: number) {
    if (quantity < 1) throw new Error("Quantity must be at least 1");
    this.inventory.reserve(productId, quantity);
    const totalAmount = quantity * 9.99;
    const confirmation = this.payments.charge(customerId, totalAmount);
    this.orderCounter++;
    return {
      orderId: `ORD-${this.orderCounter}`,
      transactionId: confirmation.transactionId,
      totalCharged: totalAmount,
    };
  }
}
