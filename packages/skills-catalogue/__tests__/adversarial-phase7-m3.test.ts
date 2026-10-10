// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { promotionNotPreApproved } from "../src/lints.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { type Skill, skillSection } from "../src/skill.js";

const BASE: Skill = {
  canonicalName: "pinner",
  skillClass: "guided",
  description: "Pins a baseline.",
  fixture: "examples/sixty-seconds",
  steps: [],
  always: [],
  never: [],
  allowedTools: [],
};

/** A skill whose one step runs `command`, with the given allowed tools. */
function pinning(command: string, allowedTools: readonly string[] = []): Skill {
  return {
    ...BASE,
    steps: [{ title: "Pin", body: { kind: "commands", commands: [command] } }],
    allowedTools,
  };
}

describe("skillSection — the heading guard", () => {
  test("a hash that is not the first character is ordinary heading text", () => {
    expect(skillSection("Notes on C#", "body")).toEqual({
      heading: "Notes on C#",
      markdown: "body",
    });
  });
});

describe("renderClaudeSkill — a skill's reference sections", () => {
  test("a skill with no steps still renders its section before its rules", () => {
    const skill: Skill = {
      ...BASE,
      references: [skillSection("Reading", "| a | b |")],
      always: [{ rule: "Cite ids", reason: "checkable" }],
    };
    const rendered = renderClaudeSkill(skill, () => "");
    expect(rendered).toContain("## Reading\n\n| a | b |\n\n## Always\n\n- Cite ids (checkable)");
  });

  test("a section's trailing newlines are trimmed but its inner blank lines are kept", () => {
    const skill: Skill = {
      ...BASE,
      references: [skillSection("Reading", "first\n\nsecond\n\n\n")],
    };
    const rendered = renderClaudeSkill(skill, () => "");
    expect(rendered).toMatch(/## Reading\n\nfirst\n\nsecond$/);
  });
});

describe("promotionNotPreApproved — a skill that pins lets the harness ask", () => {
  test("a command that only shares a prefix with the approve verb is not a promotion", () => {
    const skill = pinning("npx narrativetrace-approve-all", ["npx"]);
    expect(promotionNotPreApproved([skill])).toEqual([]);
  });

  test("the package script spelling of the verb is a promotion, and its rendered tool pattern counts", () => {
    const skill = pinning("pnpm approve-narratives", ["Bash(pnpm *)"]);
    expect(promotionNotPreApproved([skill])).toHaveLength(1);
  });

  test("a skill that never promotes may declare any tool", () => {
    const skill = pinning("pnpm test", ["pnpm", "npx"]);
    expect(promotionNotPreApproved([skill])).toEqual([]);
  });

  test("the message names the skill and quotes the tools it declares", () => {
    const skills = [
      pinning("npx narrativetrace-approve"),
      pinning("npx narrativetrace-approve", ["npx"]),
    ];
    const violations = promotionNotPreApproved(skills);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('pinner: declares allowed tools ["npx"]');
  });

  // Adversarial finding, FIXED: PROMOTION_COMMAND required the verb to start the string or follow whitespace,
  // so a promotion run by its path (`./node_modules/.bin/narrativetrace-approve`) is not caught, and
  // the skill that declares `npx` pre-approves the promotion unnoticed. Java's rule is about the
  // verb, not its spelling.
  test("a promotion run through its binary's path is still a promotion", () => {
    const skill = pinning("./node_modules/.bin/narrativetrace-approve", ["npx"]);
    expect(promotionNotPreApproved([skill])).toHaveLength(1);
  });

  // Adversarial finding, FIXED: promotionNotPreApproved only read `commands` bodies, but a step's `verify` is
  // a command string the harness also runs, so a verify that promotes a baseline is a promotion
  // the lint never sees. The same skill with the promotion in the body is caught.
  test("a promotion carried by a step's verify command is still a promotion", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        {
          title: "Check",
          body: { kind: "commands", commands: ["pnpm test"] },
          verify: "pnpm approve-narratives",
        },
      ],
      allowedTools: ["npx"],
    };
    expect(promotionNotPreApproved([skill])).toHaveLength(1);
  });
});
