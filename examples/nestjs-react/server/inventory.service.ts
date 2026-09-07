// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Injectable } from "@nestjs/common";

@Injectable()
export class InventoryService {
  private readonly stock = new Map<string, number>([
    ["SKU-1", 100],
    ["SKU-2", 50],
  ]);

  reserve(productId: string, quantity: number) {
    const available = this.stock.get(productId) ?? 0;
    if (available < quantity) throw new Error(`Insufficient stock for ${productId}`);
    this.stock.set(productId, available - quantity);
    return { reserved: true, productId, quantity };
  }
}
