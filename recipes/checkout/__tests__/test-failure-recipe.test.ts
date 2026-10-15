// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// __tests__/test-failure-recipe.test.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { expect, it } from "vitest";
import { recipeOutput, runFixture, writeNarrativeBody } from "../support/recipe-runs.js";

/**
 * Proves documentation/recipes/why-did-this-test-fail.md: the page's assertion message and the
 * narrative beside it come from one run of a test that really failed.
 *
 * @llmNote The assertion message is written to a file because it belongs to the RUNNER, not to a
 * trace artifact — it is the one thing on that page the fixture does not write. Both files land
 * under `narrativetrace-output/`, never in the source tree.
 */
const SLUG = "why-did-this-test-fail";
const SCENARIO = "the_customer_gets_an_order_id_for_their_keyboards";

/** The runner's own one-line verdict: the first line of the failure, without terminal colours. */
function assertionLine(failureMessage: string): string {
  return stripVTControlCharacters(failureMessage).split("\n")[0] as string;
}

it("reports the assertion and writes the failing test's own narrative", () => {
  const output = recipeOutput(SLUG);

  const run = runFixture(join("fixtures", "stale-expectation-fixture.ts"), output);

  expect(run.tests.map((test) => test.status)).toEqual(["failed"]);
  const message = assertionLine(run.tests[0]?.failureMessages[0] as string);
  writeFileSync(join(output, "assertion-failure.txt"), `${message}\n`, "utf-8");
  const narrative = writeNarrativeBody(
    join(output, "stale-expectation-fixture", `${SCENARIO}.md`),
    join(output, "narratives", `${SCENARIO}.md`),
  );
  expect(message).toContain("ORD-C-1234-SKU-KB-1");
  expect(message).toContain("ORD-C-1234-SKU-KB-2");
  expect(narrative).toContain("quantity: 2");
  expect(narrative).toContain("amountCents: 7998");
  expect(narrative).not.toContain("❌");
});
