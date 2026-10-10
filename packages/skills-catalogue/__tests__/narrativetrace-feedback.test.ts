// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { DOCTOR_REPORT_WELL_FORMED } from "../src/catalogue/doctor-commands.js";
import { DRAFT_REPORT, PRINT_URL } from "../src/catalogue/feedback-commands.js";
import { NARRATIVETRACE_DOCTOR } from "../src/catalogue/narrativetrace-doctor.js";
import { NARRATIVETRACE_FEEDBACK } from "../src/catalogue/narrativetrace-feedback.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { commandStrings } from "../src/skill.js";

// The skill can publish, so what it must NOT do is pinned here as hard as what it does: shows the
// whole draft, asks once, stops the turn, and prints the way to file only after the answer.

const stepTitles = NARRATIVETRACE_FEEDBACK.steps.map((step) => step.title);

describe("narrativetrace-feedback", () => {
  it("is a guided skill over the shared fixture", () => {
    expect(NARRATIVETRACE_FEEDBACK.skillClass).toBe("guided");
    expect(NARRATIVETRACE_FEEDBACK.fixture).toBe("examples/sixty-seconds");
  });

  it("declares no pre-approved tool, so the harness asks before every command", () => {
    expect(NARRATIVETRACE_FEEDBACK.allowedTools).toEqual([]);
  });

  it("renders no allowed-tools line in the Claude flavour", () => {
    expect(renderClaudeSkill(NARRATIVETRACE_FEEDBACK, () => "")).not.toContain("allowed-tools");
    expect(renderAgentsSkill(NARRATIVETRACE_FEEDBACK, () => "")).not.toContain("allowed-tools");
  });

  it("walks gather, draft, show, ask-and-stop, print — in that order", () => {
    expect(stepTitles).toEqual([
      "Gather what the report needs",
      "Draft the report and let the gate check it",
      "Show the whole draft, not a summary of it",
      "Ask once whether to file it, then stop the turn",
      "Print the way to file it, and nothing else",
    ]);
  });

  it("gathers with the doctor's own well-formedness check", () => {
    expect(NARRATIVETRACE_FEEDBACK.steps[0]?.verify).toBe(DOCTOR_REPORT_WELL_FORMED);
  });

  it("drafts with the draft channel and prints the URL with the url channel, nothing else", () => {
    const verbs = commandStrings(NARRATIVETRACE_FEEDBACK).filter((c) => /cli feedback /.test(c));
    expect(verbs).toEqual([DRAFT_REPORT, PRINT_URL]);
    expect(DRAFT_REPORT).toMatch(/cli feedback draft /);
    expect(PRINT_URL).toMatch(/cli feedback url /);
  });

  it("never instructs the gh channel, a pipe to a shell, or opening the URL", () => {
    const all = commandStrings(NARRATIVETRACE_FEEDBACK).join("\n");
    expect(all).not.toMatch(/feedback gh|\bgh\b|\bcurl\b|\bopen\b|xdg-open|\|\s*sh\b/);
  });

  it("the question step runs nothing and the show step is judged, not mechanically verified", () => {
    const [, , show, ask] = NARRATIVETRACE_FEEDBACK.steps;
    expect(ask?.body).toEqual({ kind: "commands", commands: [] });
    expect(show?.verify).toBeUndefined();
    expect(ask?.verify).toBeUndefined();
    expect(show?.flag).toMatch(/^judgmental/);
    expect(ask?.flag).toMatch(/^judgmental/);
  });

  it("the approval step says that printing the issue URL is the filing and waits for the yes", () => {
    const ask = NARRATIVETRACE_FEEDBACK.steps[3];
    expect(ask?.flag).toContain(
      "Do not print the issue URL or run gh before the user says yes — showing the URL is the filing.",
    );
  });

  it("states the never-rules a publishing skill lives by", () => {
    const never = NARRATIVETRACE_FEEDBACK.never.map((r) => r.rule).join("\n");
    expect(never).toMatch(/rendered trace, a log file or a source file/);
    expect(never).toMatch(/in the turn that asked/);
    expect(never).toMatch(/edit the draft after showing it/);
    expect(never).toMatch(/open the URL or run the printed command/);
    expect(never).toMatch(/around the gate/);
  });

  it("states the always-rules: whole draft first, the user's language, filing is public", () => {
    const always = NARRATIVETRACE_FEEDBACK.always.map((r) => r.rule).join("\n");
    expect(always).toMatch(/whole draft before asking/);
    expect(always).toMatch(/user's own language/);
    expect(always).toMatch(/public, under their own account/);
    expect(always).toMatch(/--language/);
  });

  it("names the four categories where the draft step can refuse one", () => {
    const notes = NARRATIVETRACE_FEEDBACK.steps[1]?.failure ?? [];
    expect(notes.map((n) => n.symptom).join("\n")).toMatch(/unknown category/);
    expect(notes.map((n) => n.fix).join("\n")).toMatch(/prompt, skill, doctor or library/);
  });
});

describe("narrativetrace-doctor's pointer to narrativetrace-feedback", () => {
  it("closes the doctor's always-rules with the report-it rule, naming the skill and the reason", () => {
    const closing = NARRATIVETRACE_DOCTOR.always.at(-1);
    expect(closing?.rule).toBe(
      "If a check is wrong, or its fix does not work, report it with the narrativetrace-feedback skill",
    );
    expect(closing?.reason).toMatch(
      /shows you the whole report and files nothing without your answer/,
    );
  });

  it("points at a skill that exists in the catalogue", () => {
    expect(NARRATIVETRACE_FEEDBACK.canonicalName).toBe("narrativetrace-feedback");
  });
});
