// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// __tests__/add-logging-recipe.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { contextLoggingTo } from "../support/log-context.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/add-logging-to-this-service.md: the checkout, with no log statement
 * anywhere in it, logs every call through the project's own pino logger once its collaborators are
 * wrapped. The page's output block is the file pino writes, not a rendering this test produces.
 */
const LOG_FILE = join(
  "narrativetrace-output",
  "recipes",
  "add-logging-to-this-service",
  "checkout.log",
);

beforeAll(useStableSpanIds);

it("a customer checks out", () => {
  const context = contextLoggingTo(LOG_FILE);
  const { checkout, stock, repository } = tracedCheckout(context);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
  expect(stock.availableUnits("SKU-KB")).toBe(3);
  expect(repository.saved()).toHaveLength(1);
  expect(readFileSync(LOG_FILE, "utf-8")).toContain("→ OrderService.placeOrder");
});
