// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** The service the vitest row's wiring snippet traces — any class of the project's own. */
export class OrderService {
  placeOrder(customerId: string, quantity: number): string {
    return `ORD-${customerId}-${quantity}`;
  }
}
