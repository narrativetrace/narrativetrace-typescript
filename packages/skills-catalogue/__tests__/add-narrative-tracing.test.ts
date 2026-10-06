// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { ADD_NARRATIVE_TRACING } from "../src/catalogue/add-narrative-tracing.js";
import { INIT_PREVIEW_PRODUCED_A_DIFF } from "../src/catalogue/doctor-commands.js";
import { commandStrings } from "../src/skill.js";

// This skill's last step hands off to `narrativetrace
// init`, but only ever previews it — applying the plan is the prompt's own step 3 human gate, not
// this skill's job. These tests pin that the skill can never regress into applying it.

/** Every command string this skill could execute, commands AND verify alike — the applying-form
 * rule must hold no matter which field a future edit puts a stray command into. */
function allCommandStrings(): readonly string[] {
  return [
    ...commandStrings(ADD_NARRATIVE_TRACING),
    ...ADD_NARRATIVE_TRACING.steps.flatMap((step) => (step.verify ? [step.verify] : [])),
  ];
}

describe("add-narrative-tracing: install-the-skills-for-next-time step", () => {
  it("ends with a step that installs the skills for next time", () => {
    const last = ADD_NARRATIVE_TRACING.steps.at(-1);
    expect(last?.title).toBe("Install the skills for next time");
  });

  it("its body is the preview command only, never the applying form", () => {
    const last = ADD_NARRATIVE_TRACING.steps.at(-1);
    expect(last?.body).toEqual({
      kind: "commands",
      commands: ["npx @narrativetrace/cli init --dry-run"],
    });
  });

  it("its verify is the shared INIT_PREVIEW_PRODUCED_A_DIFF check, not a vacuous stand-in", () => {
    const last = ADD_NARRATIVE_TRACING.steps.at(-1);
    expect(last?.verify).toBe(INIT_PREVIEW_PRODUCED_A_DIFF);
  });

  it("no command anywhere in the skill invokes `narrativetrace init` without --dry-run", () => {
    const offenders = allCommandStrings().filter(
      (command) => /@narrativetrace\/cli\s+init\b/.test(command) && !command.includes("--dry-run"),
    );
    expect(offenders).toEqual([]);
  });

  it("carries a never-rule stating why it only previews the install", () => {
    expect(ADD_NARRATIVE_TRACING.never.some((rule) => /--dry-run|preview/i.test(rule.rule))).toBe(
      true,
    );
  });

  it("description says the skill ends by previewing the skills install", () => {
    expect(ADD_NARRATIVE_TRACING.description).toMatch(/preview/i);
  });
});
