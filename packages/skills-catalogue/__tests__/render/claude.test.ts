// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
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

describe("renderClaudeSkill (full-structure snapshots)", () => {
  // Exact, line-by-line output — every join separator, delimiter, and blank line the piecemeal
  // .toContain() assertions below don't pin down individually (missing one leaves the rendered
  // Markdown malformed even though every individual `.toContain()` check still passes).
  it("matches the known-good rendering for a minimal skill (no steps, rules, or whenToUse)", () => {
    expect(renderClaudeSkill(BASE, () => "")).toMatchSnapshot();
  });

  it("matches the known-good rendering for a fully-populated skill", () => {
    const skill: Skill = {
      ...BASE,
      whenToUse: "when it matters",
      steps: [
        {
          title: "Do it",
          body: { kind: "commands", commands: ["pnpm test", "pnpm build"] },
          verify: "pnpm test",
          flag: "unstudied",
          failure: [{ symptom: "it breaks", cause: "bad config", fix: "fix the config" }],
        },
        {
          title: "Show it",
          body: { kind: "snippet", path: "x.js", language: "js", mask: "duration" },
        },
      ],
      always: [{ rule: "Do X", reason: "because Y" }],
      never: [{ rule: "Don't Z", reason: "because W" }],
    };
    expect(renderClaudeSkill(skill, (path) => `// ${path} content`)).toMatchSnapshot();
  });
});

describe("renderClaudeSkill", () => {
  it("renders frontmatter with name, description, and allowed-tools", () => {
    const rendered = renderClaudeSkill(BASE, () => "");
    expect(rendered).toContain("name: example-skill");
    expect(rendered).toContain('description: "An example skill."');
    expect(rendered).toContain("allowed-tools: pnpm, node");
  });

  it("omits when_to_use when absent, includes it when present", () => {
    expect(renderClaudeSkill(BASE, () => "")).not.toContain("when_to_use");
    const withWhen = { ...BASE, whenToUse: "when it matters" };
    expect(renderClaudeSkill(withWhen, () => "")).toContain('when_to_use: "when it matters"');
  });

  it("renders a commands step as a bash fence", () => {
    const skill: Skill = {
      ...BASE,
      steps: [{ title: "Do it", body: { kind: "commands", commands: ["pnpm test"] } }],
    };
    const rendered = renderClaudeSkill(skill, () => "");
    expect(rendered).toContain("## 1. Do it");
    expect(rendered).toContain("```bash\npnpm test\n```");
  });

  it("renders a snippet step through the resolver, with a mask attribute when set", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        {
          title: "Show it",
          body: { kind: "snippet", path: "x.js", language: "js", mask: "duration" },
        },
      ],
    };
    const rendered = renderClaudeSkill(skill, (path) => `// ${path} content`);
    expect(rendered).toContain("<!-- snippet: x.js mask=duration -->");
    expect(rendered).toContain("// x.js content");
    expect(rendered).toContain("<!-- /snippet -->");
  });

  it("renders a snippet step with no mask attribute when unset", () => {
    const skill: Skill = {
      ...BASE,
      steps: [{ title: "Show it", body: { kind: "snippet", path: "x.js", language: "js" } }],
    };
    const rendered = renderClaudeSkill(skill, () => "content");
    expect(rendered).toContain("<!-- snippet: x.js -->");
  });

  it("renders verify, flag, and failure notes when present", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        {
          title: "Do it",
          body: { kind: "commands", commands: ["pnpm test"] },
          verify: "pnpm test",
          flag: "unstudied",
          failure: [{ symptom: "it breaks", cause: "bad config", fix: "fix the config" }],
        },
      ],
    };
    const rendered = renderClaudeSkill(skill, () => "");
    expect(rendered).toContain("**verify:** `pnpm test`");
    expect(rendered).toContain("**Flagged:** unstudied");
    expect(rendered).toContain("**failure:** it breaks — bad config. Fix: fix the config");
  });

  it("omits the Always/Never sections when there are no rules", () => {
    const rendered = renderClaudeSkill(BASE, () => "");
    expect(rendered).not.toContain("## Always");
    expect(rendered).not.toContain("## Never");
  });

  it("renders Always/Never sections with their reasons when present", () => {
    const skill: Skill = {
      ...BASE,
      always: [{ rule: "Do X", reason: "because Y" }],
      never: [{ rule: "Don't Z", reason: "because W" }],
    };
    const rendered = renderClaudeSkill(skill, () => "");
    expect(rendered).toContain("## Always");
    expect(rendered).toContain("- Do X (because Y)");
    expect(rendered).toContain("## Never");
    expect(rendered).toContain("- Don't Z (because W)");
  });
});
