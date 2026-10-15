// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// __tests__/debug-recipe.test.ts
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recipeOutput, runFixture, writeNarrativeBody } from "../support/recipe-runs.js";

/**
 * Proves documentation/recipes/help-me-debug-and-fix-this-bug.md: the page's "before" trace comes
 * from a run that really failed, its "after" trace from the same reproduction passing against the
 * fix, and the committed approved trace still matches the fixed flow.
 */
const SLUG = "help-me-debug-and-fix-this-bug";
const FIXTURE = join("fixtures", "declined-payment-fixture.ts");
const MODULE = "declined-payment-fixture";
const FIXED = "the_stock_is_released_when_the_card_is_declined";
const BEFORE_THE_FIX = `${FIXED}_before_the_fix`;
const COMMITTED_BASELINE = join("narratives", MODULE, `${FIXED}.approved.nt`);

function narrative(output: string, scenario: string): string {
  const artifact = join(output, MODULE, `${scenario}.md`);
  return writeNarrativeBody(artifact, join(output, "narratives", `${scenario}.md`));
}

describe("help me debug and fix this bug", () => {
  it("fails the reproduction only against the code before the fix", () => {
    const output = recipeOutput(SLUG);

    const run = runFixture(FIXTURE, output);

    expect(run.tests.map((test) => [test.title, test.status])).toEqual([
      ["the stock is released when the card is declined", "passed"],
      ["the stock is released when the card is declined before the fix", "failed"],
    ]);
    expect(run.tests[1]?.failureMessages.join("\n")).toContain("expected 3 to be 5");
    expect(narrative(output, BEFORE_THE_FIX)).not.toContain("InventoryService.release");
    expect(narrative(output, FIXED)).toContain("InventoryService.release");
    expect(existsSync(join(output, "structural", MODULE, `${FIXED}.nt`))).toBe(true);
  });

  it("still pins the fixed flow with the committed approved trace", () => {
    const output = recipeOutput(SLUG, "approval-run");
    const approvedDir = recipeOutput(SLUG, "approved");
    mkdirSync(join(approvedDir, MODULE), { recursive: true });
    cpSync(COMMITTED_BASELINE, join(approvedDir, MODULE, `${FIXED}.approved.nt`));

    const run = runFixture(FIXTURE, output, {
      settings: { NARRATIVETRACE_APPROVAL: "true", NARRATIVETRACE_APPROVED_DIR: approvedDir },
      testPattern: "declined$",
    });

    expect(run.exitCode).toBe(0);
    expect(existsSync(join(approvedDir, MODULE, `${FIXED}.received.nt`))).toBe(false);
    expect(readFileSync(join(approvedDir, MODULE, `${FIXED}.approved.nt`), "utf-8")).toContain(
      "#1.3 - InventoryService.release(sku, quantity)",
    );
  });
});
