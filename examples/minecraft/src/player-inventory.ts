// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Item } from "./domain.js";

export interface PlayerInventory {
  addItem(item: Item, quantity: number): boolean;
}

export class DefaultPlayerInventory implements PlayerInventory {
  private readonly items = new Map<string, number>();
  private static readonly MAX_STACK = 64;

  addItem(item: Item, quantity: number): boolean {
    const current = this.items.get(item.name) ?? 0;
    if (current + quantity > DefaultPlayerInventory.MAX_STACK) {
      return false;
    }
    this.items.set(item.name, current + quantity);
    return true;
  }
}
