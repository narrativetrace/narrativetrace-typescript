// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { renderAgentsSkill } from "../../src/render/agents-skills.js";
import { renderClaudeSkill } from "../../src/render/claude.js";
import type { Skill } from "../../src/skill.js";

const BASE: Skill = {
  canonicalName: "example-skill",
  skillClass: "mechanical",
  description: "An example skill.",
  fixture: "examples/sixty-seconds",
  allowedTools: ["pnpm", "node"],
  steps: [],
  always: [],
  never: [],
};

describe("renderAgentsSkill", () => {
  it("renders frontmatter with only name and description — the documented Codex subset", () => {
    const rendered = renderAgentsSkill(BASE, () => "");
    expect(rendered).toContain("name: example-skill");
    expect(rendered).toContain('description: "An example skill."');
  });

  it("never emits when_to_use, even when the skill declares one", () => {
    const withWhen: Skill = { ...BASE, whenToUse: "when it matters" };
    expect(renderAgentsSkill(withWhen, () => "")).not.toContain("when_to_use");
  });

  it("never emits allowed-tools", () => {
    expect(renderAgentsSkill(BASE, () => "")).not.toContain("allowed-tools");
  });

  it("the frontmatter is exactly three lines: the two markers and the two fields", () => {
    const rendered = renderAgentsSkill(BASE, () => "");
    const frontmatter = rendered.slice(0, rendered.indexOf("---", 4) + 3);
    expect(frontmatter.split("\n")).toEqual([
      "---",
      "name: example-skill",
      'description: "An example skill."',
      "---",
    ]);
  });

  it("renders the identical body a Claude page renders for the same skill", () => {
    const skill: Skill = {
      ...BASE,
      whenToUse: "when it matters",
      steps: [
        {
          title: "Do it",
          body: { kind: "commands", commands: ["pnpm test"] },
          verify: "pnpm test",
        },
        { title: "Show it", body: { kind: "snippet", path: "x.js", language: "js" } },
      ],
      always: [{ rule: "Do X", reason: "because Y" }],
      never: [{ rule: "Don't Z", reason: "because W" }],
    };
    const resolveSnippet = (path: string) => `// ${path} content`;
    const bodyOf = (rendered: string) => rendered.slice(rendered.indexOf("\n\n# "));
    expect(bodyOf(renderAgentsSkill(skill, resolveSnippet))).toBe(
      bodyOf(renderClaudeSkill(skill, resolveSnippet)),
    );
  });
});
