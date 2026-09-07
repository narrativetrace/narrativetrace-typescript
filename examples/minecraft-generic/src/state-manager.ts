// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export interface StateManager {
  update(item: { name: string; quantity: number }, quantity: number): boolean;
}

export class DefaultStateManager implements StateManager {
  private readonly data = new Map<string, number>();
  private static readonly MAX = 64;

  update(item: { name: string; quantity: number }, quantity: number): boolean {
    const current = this.data.get(item.name) ?? 0;
    if (current + quantity > DefaultStateManager.MAX) {
      return false;
    }
    this.data.set(item.name, current + quantity);
    return true;
  }
}
