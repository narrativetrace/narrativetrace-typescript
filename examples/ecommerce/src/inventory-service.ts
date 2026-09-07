// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { onError, traced } from "@narrativetrace/proxy";
import type { Reservation } from "./domain.js";

export interface InventoryService {
  reserve(productId: string, quantity: number): Reservation;
  release(productId: string, quantity: number): void;
}

export class InMemoryInventoryService implements InventoryService {
  private readonly stock = new Map<string, number>([
    ["P1", 100],
    ["P2", 50],
    ["P3", 200],
  ]);

  @traced("productId", "quantity")
  @onError("Insufficient stock for {productId}, requested {quantity}")
  reserve(productId: string, quantity: number): Reservation {
    const available = this.stock.get(productId);
    if (available === undefined) {
      throw new Error(`Product not found: ${productId}`);
    }
    if (available < quantity) {
      throw new Error(
        `Insufficient stock for ${productId}: requested ${quantity}, available ${available}`,
      );
    }
    this.stock.set(productId, available - quantity);
    return { productId, quantity };
  }

  @traced("productId", "quantity")
  release(productId: string, quantity: number): void {
    const current = this.stock.get(productId) ?? 0;
    this.stock.set(productId, current + quantity);
  }
}
