// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { NARRATIVETRACE_DOCTOR } from "../src/catalogue/narrativetrace-doctor.js";
import { SKILLS } from "../src/catalogue-index.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { descriptionFitsBudget } from "../src/skill.js";

const skill = NARRATIVETRACE_DOCTOR;
const noSnippets = (path: string): string => path;

describe("narrativetrace-doctor — a plugin install versus a project install", () => {
  it("is named for the catalogue and ships in it", () => {
    expect(skill.canonicalName).toBe("narrativetrace-doctor");
    expect(SKILLS).toContain(skill);
  });

  it("names the skills check as project-scoped in the description, inside the budget", () => {
    expect(skill.description).toContain(
      "whether the NarrativeTrace agent skills are installed in this project and current",
    );
    expect(descriptionFitsBudget(skill)).toBe(true);
  });

  it("explains in the triggers that a personal plugin install is invisible to the check", () => {
    expect(skill.whenToUse).toContain(
      "A user who installed these skills as a personal plugin in their agent",
    );
    expect(skill.whenToUse).toContain("a plugin install is invisible to this check by design");
    expect(skill.whenToUse).toContain("only a project install reaches teammates and other agents");
  });

  it("keeps the plugin explanation out of the description, which stays inside its budget", () => {
    expect(skill.description).not.toContain("plugin");
  });

  it("renders the project-scoped sentence into both flavours and the trigger into Claude's", () => {
    const claude = renderClaudeSkill(skill, noSnippets);
    const agents = renderAgentsSkill(skill, noSnippets);
    expect(claude).toContain("agent skills are installed in this project and current");
    expect(agents).toContain("agent skills are installed in this project and current");
    expect(claude).toContain("a plugin install is invisible to this check by design");
  });
});
