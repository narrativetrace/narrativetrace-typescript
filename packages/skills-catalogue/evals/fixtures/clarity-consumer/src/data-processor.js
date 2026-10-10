// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export class DataProcessor {
  execute(data) {
    if (!data || !data.customerId || !data.sku || data.quantity < 1) {
      throw new Error("an order needs a customer, a sku and a quantity");
    }
    return `ORD-${data.customerId}-${data.sku}-${data.quantity}`;
  }
}
