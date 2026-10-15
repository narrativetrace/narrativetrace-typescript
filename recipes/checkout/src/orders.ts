// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/orders.ts
/** What the checkout saves once the card is charged. */
export interface Order {
  readonly orderId: string;
  readonly customerId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly amountCents: number;
}

/** Where orders are saved. */
export interface OrderRepository {
  save(order: Order): void;
}

/** Orders in an array, so the scenario needs no database. */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders: Order[] = [];

  save(order: Order): void {
    this.orders.push(order);
  }

  saved(): readonly Order[] {
    return this.orders;
  }
}
