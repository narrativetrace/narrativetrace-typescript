// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { BaselinePin } from "../src/catalogue/baseline-pin.js";
import { NARRATIVETRACE_DEBUG } from "../src/catalogue/narrativetrace-debug.js";
import { NARRATIVETRACE_VERIFY } from "../src/catalogue/narrativetrace-verify.js";
import { TraceReading } from "../src/catalogue/trace-reading.js";
import { FIND_DIAGRAMS, FIND_STRUCTURAL, REPRODUCE } from "../src/catalogue/verify-commands.js";
import { promotionNotPreApproved } from "../src/lints.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { descriptionFitsBudget } from "../src/skill.js";

const skill = NARRATIVETRACE_DEBUG;
const titles = skill.steps.map((step) => step.title);
const step = (title: string) => {
  const found = skill.steps.find((s) => s.title === title);
  if (found === undefined) throw new Error(`no step "${title}"`);
  return found;
};

describe("narrativetrace-debug — the loop (design D4)", () => {
  it("reproduces, finds the symptom, reads the diagram across async work, then localizes", () => {
    expect(titles.slice(0, 4)).toEqual([
      "Reproduce the symptom with tracing on",
      "Find the symptom in the values",
      "Across async work, read the sequence diagram first",
      "Localize by reading: name the first span where a value diverges",
    ]);
  });

  it("bisects, hands NarrativeTrace defects off BEFORE any fix, fixes, checks the delta, keeps", () => {
    expect(titles.slice(4, 9)).toEqual([
      "Bisect by span, not by file",
      "Hand a defect in NarrativeTrace itself to narrativetrace-feedback",
      "Fix it in the diverging span, re-run the same input, read the same span",
      "Check that nothing else moved",
      "Keep the reproduction as the regression test",
    ]);
  });

  it("ends with the SAME four pin steps the verify skill renders, then the report", () => {
    expect(skill.steps.slice(9, 13)).toEqual(BaselinePin.steps());
    expect(NARRATIVETRACE_VERIFY.steps.slice(6, 10)).toEqual(BaselinePin.steps());
    expect(titles.at(-1)).toBe("Report the root cause as the trace showed it");
    expect(titles).toHaveLength(14);
  });

  it("names the diverging span by id before any code changes", () => {
    const flag = step("Localize by reading: name the first span where a value diverges").flag ?? "";
    expect(flag).toContain("by its id (#1.3)");
    expect(flag).toContain("before any code is changed");
    expect(skill.never.map((rule) => rule.rule)).toContain(
      "Never change code before the diverging span is named",
    );
  });

  it("bisects by wrapping one more collaborator, never with @notTraced, which redacts", () => {
    const bisect = step("Bisect by span, not by file");
    expect(bisect.flag).toContain("traceObject");
    expect(bisect.flag).toContain("never @notTraced to narrow");
    expect(bisect.condition).toBeDefined();
    expect(bisect.body).toEqual({ kind: "commands", commands: [REPRODUCE] });
  });

  it("reads the diagram only across async work or an ordering symptom", () => {
    const diagram = step("Across async work, read the sequence diagram first");
    expect(diagram.body).toEqual({ kind: "commands", commands: [FIND_DIAGRAMS] });
    expect(diagram.condition).toContain("fork, async or fire-and-forget");
  });

  it("takes the shape before the fix from the red run's .md — a red run writes no .nt", () => {
    const delta = step("Check that nothing else moved");
    expect(delta.body).toEqual({ kind: "commands", commands: [FIND_STRUCTURAL] });
    expect(delta.flag).toContain("a red run writes no .nt");
  });

  it("hands a NarrativeTrace defect to the feedback skill only on a disagreement", () => {
    const handOff = step("Hand a defect in NarrativeTrace itself to narrativetrace-feedback");
    expect(handOff.condition).toContain("the trace and the code disagree");
    expect(handOff.flag).toContain("never a value from the trace");
  });

  it("reports by span id before the pin question and names it again after", () => {
    const flag = step("Report the root cause as the trace showed it").flag ?? "";
    expect(flag).toContain("before the pin question");
    expect(flag).toContain("names the span id again");
  });
});

describe("narrativetrace-debug — shared with verify, written once", () => {
  it("renders the same reading sections and the same span-id and redaction rules", () => {
    expect(skill.references).toEqual(NARRATIVETRACE_VERIFY.references);
    expect(skill.always).toContainEqual(TraceReading.CITE_SPAN_IDS);
    expect(skill.never).toContainEqual(TraceReading.NEVER_REDACTION_OFF);
    for (const rule of BaselinePin.NEVER) expect(skill.never).toContainEqual(rule);
  });

  it("has no cost rule that skips the trace — only narrowing before values", () => {
    expect(titles.some((t) => t.startsWith("Decide whether"))).toBe(false);
    expect(skill.always.map((r) => r.rule)).toContain(
      "Narrow to one span before reading its values",
    );
  });

  it("declares no allowed tool and fits the description budget", () => {
    expect(skill.allowedTools).toEqual([]);
    expect(promotionNotPreApproved([skill])).toEqual([]);
    expect(descriptionFitsBudget(skill)).toBe(true);
    expect(skill.description).toContain("'debug this with the trace'");
  });

  it("renders in both flavours with the reading sections after the steps", () => {
    for (const page of [renderClaudeSkill(skill, () => "x"), renderAgentsSkill(skill, () => "x")]) {
      expect(page).toContain("## 14. Report the root cause as the trace showed it");
      expect(page.indexOf("## Which flavour")).toBeGreaterThan(page.indexOf("## 14."));
    }
  });
});
