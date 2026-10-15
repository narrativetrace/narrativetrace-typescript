// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// fixtures/declined-payment-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { OrderServiceWithoutRelease } from "../src/order-service-without-release.js";
import { DECLINING_CARD, PaymentDeclinedError } from "../src/payments.js";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * The reproduction documentation/recipes/help-me-debug-and-fix-this-bug.md is written around: a
 * declined card must leave the stock as it found it.
 *
 * The second test is the same reproduction against the checkout as it stood before the fix
 * (`OrderServiceWithoutRelease`), so the page's "before" trace comes from a real failing run rather
 * than from prose. It FAILS by design, which is why this file is a fixture: the project's own
 * config never collects `*-fixture.ts`, and `__tests__/debug-recipe.test.ts` runs it in a nested
 * Vitest process and asserts on its verdict.
 */
test("the stock is released when the card is declined", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(narrativeContext);

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
  expect(stock.availableUnits("SKU-KB")).toBe(5);
});

test("the stock is released when the card is declined before the fix", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(
    narrativeContext,
    ({ inventory, payments, orders }) =>
      new OrderServiceWithoutRelease(inventory, payments, orders),
  );

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
  expect(stock.availableUnits("SKU-KB")).toBe(5);
});
