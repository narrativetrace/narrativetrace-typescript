// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// __tests__/review-flow-recipe.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contextLoggingTo } from "../support/log-context.js";
import { recipeOutput, runFixture, writeNarrativeBody } from "../support/recipe-runs.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/review-a-complex-flow-before-changing-it.md: the same checkout,
 * captured once at the default level and once at `summary`, writes the artifacts that page embeds
 * — and the value-free `.nt` carries no values.
 */
const SLUG = "review-a-complex-flow-before-changing-it";
const FIXTURE = join("fixtures", "checkout-review-fixture.ts");
const MODULE = "checkout-review-fixture";
const SCENARIO = "a_customer_buys_two_keyboards";

/** One capture of the fixture into `<slug>/<directory>`, at `level` (absent leaves the default). */
function capture(directory: string, level?: string): string {
  const output = recipeOutput(SLUG, directory);
  const run = runFixture(
    FIXTURE,
    output,
    level ? { settings: { NARRATIVETRACE_LEVEL: level } } : {},
  );
  expect(run.exitCode).toBe(0);
  return writeNarrativeBody(
    join(output, MODULE, `${SCENARIO}.md`),
    join(output, "narratives", `${SCENARIO}.md`),
  );
}

describe("review a complex flow before changing it", () => {
  it("carries the values at the default level and the shape at summary", () => {
    const detail = capture("detail");
    const summary = capture("summary", "summary");

    expect(detail).toContain("quantity: 2");
    expect(detail).toContain("amountCents: 7998");
    expect(detail).toContain("[REDACTED]");
    expect(summary).not.toContain("amountCents: 7998");
  });

  it("writes a structural trace of the same run that carries no values", () => {
    capture("detail");

    const structural = readFileSync(
      join(recipeOutput(SLUG, "detail"), "structural", MODULE, `${SCENARIO}.nt`),
      "utf-8",
    );

    expect(structural).toContain("OrderService.placeOrder(customerId, sku, quantity, cardNumber)");
    for (const value of ["C-1234", "SKU-KB", "7998", "REDACTED"]) {
      expect(structural).not.toContain(value);
    }
  });

  it("logs the same flow with its values through the project's own logger", () => {
    useStableSpanIds();
    const logFile = recipeOutput(SLUG, "checkout.log");
    const { checkout } = tracedCheckout(contextLoggingTo(logFile));

    checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

    expect(readFileSync(logFile, "utf-8")).toContain('"value":"7998"');
  });
});
