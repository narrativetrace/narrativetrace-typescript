// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";

// The smallest test that drives the real path: the collaborators the change touched, wired as
// production wires them, each wrapped with the test's narrativeContext. After the test, the fixture
// writes the shape to narrativetrace-output/structural/<module>/<scenario>.nt and the values to
// narrativetrace-output/<module>/<scenario>.md.
const test = createNarrativeTest();

class Inventory {
  reserve(productId: string, quantity: number): boolean {
    return quantity > 0 && productId !== "";
  }
}

class OrderService {
  constructor(private readonly inventory: Inventory) {}

  placeOrder(customerId: string, productId: string, quantity: number): string {
    if (!this.inventory.reserve(productId, quantity)) throw new RangeError("not in stock");
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

test("customer places an order", ({ narrativeContext }) => {
  const inventory = traceObject(new Inventory(), narrativeContext, {
    reserve: ["productId", "quantity"],
  });
  const orders = traceObject(new OrderService(inventory), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  expect(orders.placeOrder("C-1234", "SKU-KB", 2)).toBe("ORD-C-1234-SKU-KB-2");
});
