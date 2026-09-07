// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export interface OrderResult {
  orderId: string;
  transactionId: string;
  totalCharged: number;
}

export interface OrderResponse {
  order: OrderResult;
  trace: { roots: unknown[] };
}

export interface OrderErrorResponse {
  error: string;
  trace: { roots: unknown[] };
}

export class OrderService {
  constructor(private readonly fetch: typeof globalThis.fetch) {}

  placeOrder(customerId: string, productId: string, quantity: number) {
    return this.fetch("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, productId, quantity }),
    });
  }
}
