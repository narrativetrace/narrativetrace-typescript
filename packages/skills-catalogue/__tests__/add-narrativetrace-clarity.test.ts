// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { ADD_NARRATIVETRACE_CLARITY } from "../src/catalogue/add-narrativetrace-clarity.js";
import { CLARITY_GATE, SOLVED_FIXTURE } from "../src/catalogue/clarity-commands.js";
import { DOCTOR_REPORT_WELL_FORMED } from "../src/catalogue/doctor-commands.js";
import { findSkill, SKILLS } from "../src/catalogue-index.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { commandStrings } from "../src/skill.js";

// The skill installs the clarity gate THIS runtime ships — the Vitest suite reporter that writes
// the results file, and the `narrativetrace-clarity` bin that gates it — runs it, reads the report
// and renames by it. What it must not do is pinned as hard as what it does: no threshold
// weakened to make a failure go away, no scan copied over test output, no glossary written.

const stepTitles = ADD_NARRATIVETRACE_CLARITY.steps.map((step) => step.title);

describe("add-narrativetrace-clarity", () => {
  it("is in the catalogue under its canonical name", () => {
    expect(findSkill("add-narrativetrace-clarity")).toBe(ADD_NARRATIVETRACE_CLARITY);
    expect(SKILLS.map((s) => s.canonicalName)).toContain("add-narrativetrace-clarity");
  });

  it("is a guided skill over the solved clarity consumer", () => {
    expect(ADD_NARRATIVETRACE_CLARITY.skillClass).toBe("guided");
    expect(ADD_NARRATIVETRACE_CLARITY.fixture).toBe(SOLVED_FIXTURE);
  });

  it("grants the vocabulary its steps use and nothing that files something public", () => {
    expect(ADD_NARRATIVETRACE_CLARITY.allowedTools).toEqual(["pnpm", "npx", "node", "git"]);
    const all = commandStrings(ADD_NARRATIVETRACE_CLARITY).join("\n");
    expect(all).not.toMatch(/\bfeedback\b|\bgh\b|\bcurl\b/);
  });

  it("walks read, register, capture, run, read, explain, wire, rename, hand off", () => {
    expect(stepTitles).toEqual([
      "Read the existing test setup before changing it",
      "Register the clarity reporter in the Vitest config",
      "Make sure a test captures a traced call",
      "Run the suite so the reporter writes the results",
      "Read the scores and the issues",
      "Explain the scores, notes and what they do not show",
      "Wire the gate into the package scripts, only when asked",
      "Rename by the report's suggestions, then re-run until the gate is clean",
      "Hand missing tracing or output to the doctor",
    ]);
  });

  it("gates on the shipped bin over the reporter's results file, writing beside it", () => {
    expect(CLARITY_GATE).toMatch(/^npx narrativetrace-clarity /);
    expect(CLARITY_GATE).toContain("--input narrativetrace-output/clarity-results.json");
    expect(CLARITY_GATE).toContain("--output-dir narrativetrace-output");
  });

  it("never mentions the repository-only scanner, which a consumer cannot run", () => {
    const rendered = renderClaudeSkill(ADD_NARRATIVETRACE_CLARITY, () => "");
    expect(rendered).not.toMatch(/clarity-scan|tools\//);
  });

  it("shows the reporter registration, the capturing test and the script from real files", () => {
    const snippets = ADD_NARRATIVETRACE_CLARITY.steps.flatMap((s) =>
      s.body.kind === "snippet" ? [s.body.path] : [],
    );
    expect(snippets).toEqual([
      `${SOLVED_FIXTURE}/vitest.config.js`,
      `${SOLVED_FIXTURE}/test/order-placer.test.js`,
      `${SOLVED_FIXTURE}/package.json`,
    ]);
  });

  it("hands off to the doctor with its own well-formedness check", () => {
    const last = ADD_NARRATIVETRACE_CLARITY.steps.at(-1);
    expect(last?.verify).toBe(DOCTOR_REPORT_WELL_FORMED);
  });

  it("states the never-rules that keep a gate honest", () => {
    const never = ADD_NARRATIVETRACE_CLARITY.never.map((r) => r.rule).join("\n");
    expect(never).toMatch(/lower or replace an existing threshold/);
    expect(never).toMatch(/promise a score for an untested rename/);
    expect(never).toMatch(/harvest a glossary/);
    expect(never).toMatch(/missing results file successful/);
    expect(never).toMatch(/import the reporter from the package root/);
  });

  it("renders the Claude flavour with allowed-tools and the agents flavour without", () => {
    const claude = renderClaudeSkill(ADD_NARRATIVETRACE_CLARITY, () => "");
    expect(claude).toContain("allowed-tools: Bash(pnpm *), Bash(npx *), Bash(node *), Bash(git *)");
    expect(renderAgentsSkill(ADD_NARRATIVETRACE_CLARITY, () => "")).not.toContain("allowed-tools");
  });
});
