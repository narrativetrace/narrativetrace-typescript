// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/inventory.ts
/** Stock the checkout reserves from and gives back to. */
export interface InventoryService {
  reserve(sku: string, quantity: number): void;
  release(sku: string, quantity: number): void;
  availableUnits(sku: string): number;
}

/** Stock in a map, so the scenario needs no database. */
export class InMemoryInventory implements InventoryService {
  private readonly unitsBySku = new Map<string, number>();

  constructor(sku: string, units: number) {
    this.unitsBySku.set(sku, units);
  }

  reserve(sku: string, quantity: number): void {
    const available = this.availableUnits(sku);
    if (available < quantity) {
      throw new Error(`not enough stock for ${sku}`);
    }
    this.unitsBySku.set(sku, available - quantity);
  }

  release(sku: string, quantity: number): void {
    this.unitsBySku.set(sku, this.availableUnits(sku) + quantity);
  }

  availableUnits(sku: string): number {
    return this.unitsBySku.get(sku) ?? 0;
  }
}
