// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FRAMEWORK_ROWS, NO_TIER_B_CASE } from "@narrativetrace/tooling";
import { describe, expect, it } from "vitest";

const EVALS = join(import.meta.dirname, "..");
const SKILL = "add-narrative-tracing";

/**
 * D4: the framework table names the Tier B case that exercises a row, and the case grades the
 * row's own check by id — so a renamed case or check fails here, not in a trial nobody reads.
 */
describe("the framework table's Tier B cases", () => {
  const rowsWithCases = FRAMEWORK_ROWS.filter((row) => row.tierBCase !== NO_TIER_B_CASE);

  it("exercises the runtime's main web framework at least", () => {
    expect(rowsWithCases.map((row) => row.id)).toContain("express");
  });

  it.each(
    rowsWithCases.map((row) => [row.id, row] as const),
  )("%s: names a case that exists, runs on this checkout's packages, and grades the row's check", (_id, row) => {
    const caseDir = join(EVALS, SKILL, row.tierBCase);
    expect(existsSync(join(caseDir, "prompt.md"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf-8")) as {
      setup?: string;
      turns?: Record<string, string>;
    };
    expect(manifest.setup).toBe("checkout-registry");
    // The framework step is in the skill, which exists only once init is applied — so the
    // user's answer to the prompt's step-3 gate is a turn of the case, never left unanswered.
    expect(manifest.turns?.["2"]).toMatch(/run it for real/i);
    expect(readFileSync(join(caseDir, "graders", "verify.sh"), "utf-8")).toContain(
      `f.id === "${row.check.id}"`,
    );
  });
});
