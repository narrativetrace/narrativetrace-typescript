// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";
import type { ProductCatalogService } from "./catalog-service.js";

const ROUND_TRIP_MS = 5;

/**
 * A catalog behind a simulated network round trip: the async work the fork/join scenario runs
 * concurrently (the in-process twin of Java's worker-thread lookups).
 */
export class RemoteCatalogService {
  constructor(private readonly origin: ProductCatalogService) {}

  @traced("productId")
  async lookupPrice(productId: string): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, ROUND_TRIP_MS));
    return this.origin.lookupPrice(productId);
  }
}
