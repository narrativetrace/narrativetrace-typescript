// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// fixtures/checkout-review-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * One successful checkout, the flow documentation/recipes/review-a-complex-flow-before-changing-it.md
 * is read before changing anything.
 *
 * A fixture because the page needs the same run under two capture levels:
 * `__tests__/review-flow-recipe.test.ts` runs it in a nested Vitest process once at the default
 * level and once at `summary`. It passes either way — nothing here fails by design.
 */
test("a customer buys two keyboards", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(narrativeContext);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
  expect(stock.availableUnits("SKU-KB")).toBe(3);
  expect(repository.saved()).toHaveLength(1);
});
