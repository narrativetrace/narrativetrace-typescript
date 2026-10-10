// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { renderClaudeSkill } from "../../src/render/claude.js";
import { type Skill, skillSection } from "../../src/skill.js";

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
  it("renders frontmatter with name, description, and allowed-tools as Bash tool patterns", () => {
    const rendered = renderClaudeSkill(BASE, () => "");
    expect(rendered).toContain("name: example-skill");
    expect(rendered).toContain('description: "An example skill."');
    expect(rendered).toContain("allowed-tools: Bash(pnpm *), Bash(node *)");
  });

  it("omits the allowed-tools line when the skill pre-approves nothing", () => {
    const rendered = renderClaudeSkill({ ...BASE, allowedTools: [] }, () => "");
    expect(rendered).not.toContain("allowed-tools");
    expect(rendered).toMatch(/^---\nname: example-skill\ndescription: [^\n]*\n---\n/);
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

  it("renders no empty fence for a step that runs nothing (its flag carries the instruction)", () => {
    const skill: Skill = {
      ...BASE,
      steps: [{ title: "Ask", body: { kind: "commands", commands: [] }, flag: "judgmental" }],
    };
    const rendered = renderClaudeSkill(skill, () => "");
    expect(rendered).not.toContain("```");
    expect(rendered).toContain("**Flagged:** judgmental");
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

  it("renders a step condition between the heading and the body", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        {
          title: "Conditional step",
          body: { kind: "commands", commands: ["pnpm test"] },
          condition: "only when the project has no entry point",
        },
      ],
    };
    expect(renderClaudeSkill(skill, () => "")).toContain(
      "## 1. Conditional step\n\n**when:** only when the project has no entry point\n\n```bash",
    );
  });

  it("renders no when line for an unconditional step", () => {
    const skill: Skill = {
      ...BASE,
      steps: [{ title: "Plain", body: { kind: "commands", commands: ["pnpm test"] } }],
    };
    expect(renderClaudeSkill(skill, () => "")).not.toContain("**when:**");
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

describe("reference sections — shared text rendered after the steps", () => {
  const withSection: Skill = {
    ...BASE,
    steps: [{ title: "Read it", body: { kind: "commands", commands: ["pnpm test"] } }],
    always: [{ rule: "Cite ids", reason: "a claim must be checkable" }],
    references: [skillSection("How to read a trace", "| a | b |\n|---|---|\n| 1 | 2 |\n")],
  };

  it("renders each section as a level-two heading after the steps and before Always", () => {
    const rendered = renderClaudeSkill(withSection, () => "");
    expect(rendered).toContain(
      "```\n\n## How to read a trace\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n## Always",
    );
  });

  it("renders no reference heading for a skill without sections", () => {
    expect(renderClaudeSkill(BASE, () => "")).not.toContain("How to read a trace");
  });
});

describe("a code step — inline code the reader adds to their own project", () => {
  it("renders the code fenced in its language, with no command fence", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        {
          title: "Turn it on",
          body: { kind: "code", language: "ts", code: "createNarrativeTest({ approval: true });" },
        },
      ],
    };
    expect(renderClaudeSkill(skill, () => "")).toContain(
      "## 1. Turn it on\n\n```ts\ncreateNarrativeTest({ approval: true });\n```",
    );
  });
});

describe("skillSection — the guard on a section's heading and body", () => {
  it.each([
    "",
    "  ",
    "two\nlines",
    "carriage\rreturn",
    "# a heading marker",
  ])("refuses the heading %j", (heading) => {
    expect(() => skillSection(heading, "body")).toThrow(TypeError);
  });

  it("refuses a blank body", () => {
    expect(() => skillSection("Heading", " \n ")).toThrow(TypeError);
  });

  it("keeps a valid heading and body as given", () => {
    expect(skillSection("Heading", "body")).toEqual({ heading: "Heading", markdown: "body" });
  });
});
