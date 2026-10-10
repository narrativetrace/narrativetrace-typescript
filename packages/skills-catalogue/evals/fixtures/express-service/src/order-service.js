// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export class OrderService {
  placeOrder(customerId, sku, quantity) {
    if (quantity < 1) throw new Error("an order needs at least one item");
    return { orderId: `ORD-${customerId}-${sku}`, customerId, sku, quantity };
  }
}
