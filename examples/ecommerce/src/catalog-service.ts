// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";

export interface ProductCatalogService {
  lookupPrice(productId: string): number;
}

const PRICES: ReadonlyMap<string, number> = new Map([
  ["P1", 29.99],
  ["P2", 49.99],
  ["P3", 9.99],
]);

export class InMemoryCatalogService implements ProductCatalogService {
  @traced("productId")
  lookupPrice(productId: string): number {
    const price = PRICES.get(productId);
    if (price === undefined) {
      throw new Error(`Product not found: ${productId}`);
    }
    return price;
  }
}
