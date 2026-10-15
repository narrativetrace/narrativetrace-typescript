// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// __tests__/refactoring-recipe.test.ts
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { type FixtureRun, recipeOutput, runFixture } from "../support/recipe-runs.js";

/**
 * Proves documentation/recipes/review-a-refactoring-did-behaviour-change.md: the committed approved
 * trace still matches the shipped checkout, and the refactoring that drops the release is rejected
 * by a diff that names the dropped call — while the test's own assertions still pass.
 *
 * @llmNote The approved directory is a FRESH copy under `narrativetrace-output/`, named by a
 * relative path: an approval mismatch writes a `.received.nt` beside the approved trace, and a
 * verification run may never write where the repository lives. Each test owns its own copy, so
 * neither can delete the other's evidence.
 */
const SLUG = "review-a-refactoring-did-behaviour-change";
const FIXTURE = join("fixtures", "refactored-checkout-fixture.ts");
const MODULE = "refactored-checkout-fixture";
const SCENARIO = "a_declined_card_saves_no_order";
const COMMITTED_BASELINE = join("narratives", MODULE, `${SCENARIO}.approved.nt`);

/** Runs the fixture under approval against a copy of the committed baseline, in `<slug>/<name>`. */
function runUnderApproval(name: string, droppedTheRelease: boolean): [FixtureRun, string] {
  const approvedDir = recipeOutput(SLUG, name);
  mkdirSync(join(approvedDir, MODULE), { recursive: true });
  cpSync(COMMITTED_BASELINE, join(approvedDir, MODULE, `${SCENARIO}.approved.nt`));
  const run = runFixture(FIXTURE, recipeOutput(SLUG, `${name}-run`), {
    settings: {
      NARRATIVETRACE_APPROVAL: "true",
      NARRATIVETRACE_APPROVED_DIR: approvedDir,
      RECIPE_REFACTORING_DROPPED_THE_RELEASE: String(droppedTheRelease),
    },
  });
  return [run, join(approvedDir, MODULE, `${SCENARIO}.received.nt`)];
}

describe("review a refactoring: did behaviour change", () => {
  it("matches the committed approved trace against the shipped checkout", () => {
    const [run, received] = runUnderApproval("approved-as-shipped", false);

    expect(run.exitCode).toBe(0);
    expect(existsSync(received)).toBe(false);
  });

  it("rejects the dropped release with a diff that names it, while the assertions still pass", () => {
    const [run, received] = runUnderApproval("approved-after-the-refactoring", true);

    expect(run.tests.map((test) => test.status)).toEqual(["failed"]);
    const rejection = run.tests[0]?.failureMessages[0] as string;
    expect(rejection).toContain("InventoryService.release");
    expect(rejection).not.toContain("expected");
    expect(existsSync(received)).toBe(true);
    writeFileSync(recipeOutput(SLUG, "approval-rejection.txt"), `${firstBlock(rejection)}\n`);
    expect(readFileSync(received, "utf-8")).not.toContain("InventoryService.release");
  });
});

/** The rejection's own text up to the stack trace the runner appends. */
function firstBlock(message: string): string {
  return stripVTControlCharacters(message).split("\n    at ")[0] as string;
}
