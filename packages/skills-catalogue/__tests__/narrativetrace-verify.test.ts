// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { ApprovalGate } from "../src/catalogue/approval-gate.js";
import { NARRATIVETRACE_FEEDBACK } from "../src/catalogue/narrativetrace-feedback.js";
import {
  NARRATIVETRACE_VERIFY,
  ONLY_ON_A_MISMATCH,
} from "../src/catalogue/narrativetrace-verify.js";
import { TraceReading } from "../src/catalogue/trace-reading.js";
import {
  APPROVE,
  FIND_STRUCTURAL,
  RUN_THE_PATH,
  RUN_THE_SUITE,
  SHOW_RECEIVED,
} from "../src/catalogue/verify-commands.js";
import { promotionNotPreApproved } from "../src/lints.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { commandStrings, descriptionFitsBudget } from "../src/skill.js";

const skill = NARRATIVETRACE_VERIFY;
const titles = skill.steps.map((step) => step.title);
const step = (title: string) => {
  const found = skill.steps.find((s) => s.title === title);
  if (found === undefined) throw new Error(`no step "${title}"`);
  return found;
};

describe("narrativetrace-verify — the loop (design D1)", () => {
  it("decides whether to trace FIRST, then writes the intent before anything runs (D2, D5)", () => {
    expect(titles.slice(0, 3)).toEqual([
      "Decide whether to trace, and say so",
      "Write the intent down before running anything",
      "Run the smallest real path with tracing on",
    ]);
  });

  it("reads structure before values, and opens values, fixes and re-reads only on a mismatch", () => {
    expect(titles.slice(3, 6)).toEqual([
      "Read the structural trace first, against the intent",
      "Open values on the span that looks wrong, and only there",
      "Fix, re-run, read again",
    ]);
    expect(step("Open values on the span that looks wrong, and only there").condition).toBe(
      ONLY_ON_A_MISMATCH,
    );
    expect(step("Fix, re-run, read again").condition).toBe(ONLY_ON_A_MISMATCH);
  });

  it("ends with the four pin steps and then the report", () => {
    expect(titles.slice(6)).toEqual([
      "Turn approval mode on",
      "Run the suite in approval mode and show every .received.nt",
      "Ask once whether to pin it, then stop the turn",
      "Promote what was shown, and nothing else",
      "Report what the trace showed",
    ]);
  });

  it("the skip is a spoken decision with its reason, and ends the skill", () => {
    const flag = step("Decide whether to trace, and say so").flag ?? "";
    expect(flag).toContain("'tracing: <the reason>'");
    expect(flag).toContain("'skipping narrativetrace-verify:");
    expect(flag).toContain("a skip ends the skill here");
  });

  it("runs the one test with the path placeholder, the pin runs the WHOLE suite", () => {
    expect(step("Run the smallest real path with tracing on").verify).toBe(RUN_THE_PATH);
    expect(RUN_THE_PATH).toContain("<the smallest test that drives the real path>");
    const pinRun = step("Run the suite in approval mode and show every .received.nt");
    expect(pinRun.body).toEqual({ kind: "commands", commands: [RUN_THE_SUITE, SHOW_RECEIVED] });
    expect(RUN_THE_SUITE).not.toContain("<");
  });

  it("reads the .nt with the structural listing, and promotes with the approve verb only", () => {
    expect(step("Read the structural trace first, against the intent").body).toEqual({
      kind: "commands",
      commands: [FIND_STRUCTURAL],
    });
    expect(commandStrings(skill).filter((c) => c === APPROVE)).toEqual([APPROVE]);
    expect(step("Promote what was shown, and nothing else").body).toEqual({
      kind: "commands",
      commands: [APPROVE],
    });
  });

  it("every claim in the report cites a span id; 'tests pass' alone is not the report", () => {
    const flag = step("Report what the trace showed").flag ?? "";
    expect(flag).toContain("citing the span id");
    expect(flag).toContain("'tests pass' alone is not the report");
    expect(skill.always).toContainEqual(TraceReading.CITE_SPAN_IDS);
  });
});

describe("narrativetrace-verify — the pin reuses the feedback skill's gate, in its words", () => {
  it("asks once and stops, with the gate's own sentence", () => {
    const ask = step("Ask once whether to pin it, then stop the turn").flag ?? "";
    const feedbackAsk = NARRATIVETRACE_FEEDBACK.steps.find((s) =>
      s.title.startsWith("Ask once"),
    )?.flag;
    const gateSentence = ApprovalGate.askedThenStopped("").trim();
    expect(ask.startsWith(gateSentence)).toBe(true);
    expect(feedbackAsk?.startsWith(gateSentence)).toBe(true);
    expect(ask).toContain("the question is the reply's last line");
    // Trial 2026-10-10 (haiku, verify-unintended-interaction #1): an explanation of what approving
    // means followed the question. The flag now names that sentence and where it goes.
    expect(ask).toContain("with no sentence after it: write the explanation first, then ask");
    // Iteration 2 (trial #3 of the same case closed with "Once you say yes, the suite should be
    // green." after the question): the flag shows the last line's form and what may not follow it.
    expect(ask).toContain("The final line is the question alone");
    // Iteration 3 (debug trial #1 closed "…baseline? (Running npx narrativetrace-approve promotes
    // the trace; I won't do it without your yes.)"): nothing after the question mark, named.
    expect(ask).toContain("nothing after its question mark");
    expect(ask).toContain("not a parenthetical");
  });

  it("shows the whole review copy, in the words the feedback skill shows its draft", () => {
    const show = step("Run the suite in approval mode and show every .received.nt").flag ?? "";
    expect(show).toContain(ApprovalGate.shownWhole("each .received.nt that run wrote"));
  });

  it("never promotes in the turn that asked, never edits after showing — the gate's rules", () => {
    const never = skill.never.map((rule) => rule.rule);
    expect(never).toContain("Never promote a baseline in the turn that asked");
    expect(never).toContain("Never edit the .received.nt after showing it");
    expect(never).toContain("Never commit a .received.nt");
    const reason = (rule: string, from: typeof skill) =>
      from.never.find((r) => r.rule.startsWith(rule))?.reason;
    expect(reason("Never promote", skill)).toBe(reason("Never file", NARRATIVETRACE_FEEDBACK));
  });

  it("turns approval mode on only when it is off, in this runtime's own switch", () => {
    const on = step("Turn approval mode on");
    expect(on.body).toEqual(expect.objectContaining({ kind: "code", language: "ts" }));
    expect(on.body.kind === "code" && on.body.code).toContain(
      "createNarrativeTest({ approval: true })",
    );
    expect(on.condition).toContain("config.approval-mode");
    expect(on.flag).toContain("narratives/**/*.received.nt");
  });
});

describe("narrativetrace-verify — surfaces and safety", () => {
  it("declares no allowed tool: the promotion must not be pre-approved", () => {
    expect(skill.allowedTools).toEqual([]);
    expect(promotionNotPreApproved([skill])).toEqual([]);
    expect(renderClaudeSkill(skill, () => "")).not.toContain("allowed-tools");
  });

  it("renders the shared reading sections after its steps, in both flavours", () => {
    for (const page of [renderClaudeSkill(skill, () => "x"), renderAgentsSkill(skill, () => "x")]) {
      expect(page).toContain("## Which flavour answers which question");
      expect(page).toContain("## Shapes that mean something went wrong");
      expect(page.indexOf("## Shapes")).toBeLessThan(page.indexOf("## Always"));
    }
  });

  it("the flavour table names this runtime's own artifact locations", () => {
    expect(TraceReading.FLAVOURS.markdown).toContain("narrativetrace-output/structural/");
    expect(TraceReading.FLAVOURS.markdown).not.toContain("build/narrativetrace");
  });

  it("fits the description budget and names its triggers", () => {
    expect(descriptionFitsBudget(skill)).toBe(true);
    expect(skill.description).toContain("'verify this change with the trace'");
    expect(skill.fixture).toBe("examples/sixty-seconds");
  });
});
