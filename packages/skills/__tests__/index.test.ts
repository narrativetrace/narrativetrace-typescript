// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  findSkill,
  renderAgentsMdSnippet,
  renderClaudeSkill,
  replaySkill,
  SKILLS,
  vocabularyViolations,
} from "../src/index.js";

// Exercises the package's public entry point end to end, not just the individual modules the
// other test files import directly.
describe("public API surface", () => {
  it("re-exports the catalogue and every render/lint/replay entry point", () => {
    const doctor = findSkill("narrativetrace-doctor");
    if (!doctor) throw new Error("narrativetrace-doctor missing from the catalogue");
    expect(doctor).toBe(SKILLS[0]);
    expect(vocabularyViolations(doctor)).toEqual([]);
    expect(renderAgentsMdSnippet(SKILLS, [])).toContain("narrativetrace-doctor");
    expect(renderClaudeSkill(doctor, () => "x")).toContain("narrativetrace-doctor");
    const [result] = replaySkill(doctor, "/fixture", () => undefined);
    expect(result?.ran).toBe(true);
  });
});
