// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { recipeOutput, runFixture, writeNarrativeBody } from "../support/recipe-runs.js";

/**
 * Proves documentation/recipes/trace-in-production-without-the-cost.md: the SAME declined-payment
 * run, captured once at `detail` and once at `errors`, writes the two artifacts that page embeds —
 * `errors` keeps the failed run whole and drops every parameter value, and a successful run at
 * `errors` writes no artifact at all (release rule 8, docs as tests).
 *
 * @llmNote The scenario is `declined-payment-fixture`'s fixed reproduction, reused rather than
 * rewritten: this page's subject is the level dial, not another flow, and a reader comparing the two
 * levels should be comparing one run's renderings. Only the passing test is selected — the
 * fixture's other test fails by design for documentation/recipes/help-me-debug-and-fix-this-bug.md.
 */
const SLUG = "trace-in-production-without-the-cost";
const DECLINED = {
  fixture: "declined-payment-fixture",
  scenario: "the_stock_is_released_when_the_card_is_declined",
  testPattern: "declined$",
};
const SUCCESSFUL = {
  fixture: "checkout-review-fixture",
  scenario: "a_customer_buys_two_keyboards",
};
const CALLS_OF_THE_FAILED_RUN = [
  "OrderService.placeOrder",
  "InventoryService.reserve",
  "PaymentService.charge",
  "InventoryService.release",
];

interface Scenario {
  readonly fixture: string;
  readonly scenario: string;
  readonly testPattern?: string;
}

/** One nested, real Vitest run of `scenario` into `<slug>/<directory>` at `level` (absent: detail). */
function capture(scenario: Scenario, directory: string, level?: string): string {
  const output = recipeOutput(SLUG, directory);
  const run = runFixture(join("fixtures", `${scenario.fixture}.ts`), output, {
    ...(level ? { settings: { NARRATIVETRACE_LEVEL: level } } : {}),
    ...(scenario.testPattern ? { testPattern: scenario.testPattern } : {}),
  });
  expect(run.exitCode).toBe(0);
  return output;
}

/** The narrative a run wrote, without its per-run frontmatter, as the page embeds it. */
function narrativeOf(output: string, scenario: Scenario): string {
  return writeNarrativeBody(
    join(output, scenario.fixture, `${scenario.scenario}.md`),
    join(output, "narratives", `${scenario.scenario}.md`),
  );
}

describe("trace in production without the cost", () => {
  let detail: string;
  let errors: string;
  let successfulAtDetail: string;
  let successfulAtErrors: string;

  beforeAll(() => {
    detail = narrativeOf(capture(DECLINED, "detail"), DECLINED);
    errors = narrativeOf(capture(DECLINED, "errors", "errors"), DECLINED);
    successfulAtDetail = capture(SUCCESSFUL, "detail-successful");
    successfulAtErrors = capture(SUCCESSFUL, "errors-successful", "errors");
  }, 60_000);

  it("errors keeps the failed run whole", () => {
    for (const call of CALLS_OF_THE_FAILED_RUN) {
      expect(errors).toContain(call);
    }
  });

  it("a successful run writes no artifact at errors and does at detail", () => {
    // The control: the same path IS written when the level keeps successful runs, so the
    // absence is the level's doing and not a path that was never right.
    expect(existsSync(join(successfulAtDetail, SUCCESSFUL.fixture))).toBe(true);
    expect(existsSync(join(successfulAtErrors, SUCCESSFUL.fixture))).toBe(false);
    expect(readdirSync(successfulAtErrors)).toEqual(["vitest-report.json"]);
  });

  it("detail carries the values errors suppresses", () => {
    expect(detail).toContain('customerId: "C-1234"');
    expect(errors).not.toContain("C-1234");
  });

  it("both levels still redact the card number", () => {
    for (const narrative of [detail, errors]) {
      expect(narrative).toContain("[REDACTED]");
      expect(narrative).not.toContain("4000000000000002");
    }
  });

  it("writes a structural trace at errors that carries no values", () => {
    const structural = readFileSync(
      join(recipeOutput(SLUG, "errors"), "structural", DECLINED.fixture, `${DECLINED.scenario}.nt`),
      "utf-8",
    );

    expect(structural).toContain("InventoryService.release(sku, quantity)");
    expect(structural).not.toContain("C-1234");
  });
});
