// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BODY_PATH,
  DRAFT_FILES_WRITTEN,
  DRAFT_PATH,
  DRAFT_REPORT,
  PRINT_URL,
  SHOW_DRAFT,
} from "../src/catalogue/feedback-commands.js";
import { NARRATIVETRACE_FEEDBACK } from "../src/catalogue/narrativetrace-feedback.js";
import { publishingNotPreApproved } from "../src/lints.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import type { Skill } from "../src/skill.js";

const BASE: Skill = {
  canonicalName: "narrativetrace-x",
  skillClass: "guided",
  description: "A reporting skill.",
  fixture: "examples/sixty-seconds",
  allowedTools: [],
  steps: [],
  always: [],
  never: [],
};

function reportingSkill(allowedTools: string[]): Skill {
  return {
    ...BASE,
    allowedTools,
    steps: [
      {
        title: "File it",
        body: { kind: "commands", commands: ["npx @narrativetrace/cli feedback draft"] },
      },
    ],
  };
}

describe("publishingNotPreApproved (adversarial)", () => {
  it("flags a pre-approved publishing tool written in its rendered Bash(...) spelling", () => {
    expect(publishingNotPreApproved([reportingSkill(["Bash(npx *)"])])).toHaveLength(1);
  });

  it("flags the shipped feedback skill when someone adds npx back to its allowed tools", () => {
    const skill = { ...NARRATIVETRACE_FEEDBACK, allowedTools: ["npx"] };
    expect(publishingNotPreApproved([skill])).toHaveLength(2);
  });
});

describe("renderClaudeSkill frontmatter with no allowed tools (adversarial)", () => {
  it("keeps a multi-line description on one frontmatter line, closing after three lines", () => {
    const skill: Skill = { ...BASE, description: "line one\n---\nline two" };
    const lines = renderClaudeSkill(skill, () => "").split("\n");
    expect(lines.indexOf("---", 1)).toBe(3);
    expect(lines[2]).toBe('description: "line one\\n---\\nline two"');
  });

  it("keeps a skill that pre-approves nothing but still publishes visible to the lint", () => {
    const skill = reportingSkill(["npx"]);
    const rendered = renderClaudeSkill({ ...skill, allowedTools: [] }, () => "");
    expect(rendered).not.toContain("allowed-tools");
    expect(publishingNotPreApproved([{ ...skill, allowedTools: [] }])).toEqual([]);
  });
});

describe("body rendering of a commands step with no commands (adversarial)", () => {
  it("leaves one blank line between the heading and a verify when there is no flag", () => {
    const skill: Skill = {
      ...BASE,
      steps: [{ title: "Check", body: { kind: "commands", commands: [] }, verify: "pnpm test" }],
    };
    expect(renderClaudeSkill(skill, () => "")).toContain("## 1. Check\n\n**verify:** `pnpm test`");
  });
});

describe("feedback-commands shell verifies and printers (adversarial)", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "adv-m3-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  function writeFile(rel: string, content = "x"): void {
    mkdirSync(dirname(join(cwd, rel)), { recursive: true });
    writeFileSync(join(cwd, rel), content);
  }

  function runIn(command: string): string {
    return execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }

  it("the draft-files verify fails when only the draft exists and not the pasted body", () => {
    writeFile(DRAFT_PATH);
    expect(() => runIn(DRAFT_FILES_WRITTEN)).toThrow();
  });

  it("the draft-files verify passes only once both draft and body files exist", () => {
    writeFile(DRAFT_PATH);
    writeFile(BODY_PATH);
    expect(() => runIn(DRAFT_FILES_WRITTEN)).not.toThrow();
  });

  it("the show-draft command prints the whole draft file byte for byte", () => {
    const draft = "# Draft\n\nbody line\n";
    writeFile(DRAFT_PATH, draft);
    expect(runIn(SHOW_DRAFT)).toBe(draft);
  });

  it("the print-URL command differs from the draft command only in its subcommand", () => {
    expect(PRINT_URL).toBe(DRAFT_REPORT.replace("feedback draft", "feedback url"));
  });
});

describe("narrativetrace-feedback rendered question step (adversarial)", () => {
  it("renders the ask-and-stop step with no fence between its heading and the print step", () => {
    const rendered = renderClaudeSkill(NARRATIVETRACE_FEEDBACK, () => "");
    const ask = rendered.slice(rendered.indexOf("## 4."), rendered.indexOf("## 5."));
    expect(ask).not.toContain("```");
    expect(ask).toContain("**Flagged:** judgmental");
  });
});
