// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// fixtures/refactored-checkout-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { DefaultOrderService } from "../src/order-service.js";
import { OrderServiceWithoutRelease } from "../src/order-service-without-release.js";
import { DECLINING_CARD, PaymentDeclinedError } from "../src/payments.js";
import { type CheckoutFactory, tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * Which version of the checkout this run wires: the one that releases the reservation when the
 * charge is declined, or the refactoring that dropped that call. An environment variable, because
 * one build has to run both — in your project the refactoring is an edit to one file and this
 * switch does not exist.
 */
const refactoringDroppedTheRelease = process.env.RECIPE_REFACTORING_DROPPED_THE_RELEASE === "true";

const checkoutVersion: CheckoutFactory = ({ inventory, payments, orders }) =>
  refactoringDroppedTheRelease
    ? new OrderServiceWithoutRelease(inventory, payments, orders)
    : new DefaultOrderService(inventory, payments, orders);

/**
 * The test documentation/recipes/review-a-refactoring-did-behaviour-change.md pins: a declined card
 * must save no order. It passes before and after the refactoring — which is the whole point of the
 * page — so only the approved structure can object.
 *
 * A fixture because `__tests__/refactoring-recipe.test.ts` runs it twice under approval mode, once
 * per version of the checkout, in nested Vitest processes, and reads the verdicts.
 */
test("a declined card saves no order", ({ narrativeContext }) => {
  const { checkout, repository } = tracedCheckout(narrativeContext, checkoutVersion);

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
});
