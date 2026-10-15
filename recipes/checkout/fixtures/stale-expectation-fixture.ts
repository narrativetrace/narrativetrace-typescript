// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// fixtures/stale-expectation-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * The failing checkout test documentation/recipes/why-did-this-test-fail.md is read through. It
 * fails on an assertion, by design, which is why it is a fixture: the project's own config never
 * collects `*-fixture.ts`, and `__tests__/test-failure-recipe.test.ts` runs it in a nested Vitest
 * process and writes down what the run reported.
 *
 * @llmNote Nothing here says which side is wrong — that is the reader's exercise, and the
 * narrative the run writes is what settles it. Do not add a comment that gives it away.
 */
test("the customer gets an order id for their keyboards", ({ narrativeContext }) => {
  const { checkout } = tracedCheckout(narrativeContext);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-1");
});
