// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { NARRATIVETRACE_DEBUG } from "../src/catalogue/narrativetrace-debug.js";
import {
  FROM_THE_SOURCE,
  NARRATIVETRACE_EXPLAIN,
  ONLY_WHAT_THE_QUESTION_NEEDS,
} from "../src/catalogue/narrativetrace-explain.js";
import { TraceReading } from "../src/catalogue/trace-reading.js";
import {
  FIND_NARRATIVES,
  FIND_STRUCTURAL,
  RUN_THE_SCENARIO,
} from "../src/catalogue/verify-commands.js";
import { SKILLS } from "../src/catalogue-index.js";
import { promotionNotPreApproved } from "../src/lints.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { commandStrings, descriptionFitsBudget } from "../src/skill.js";

const skill = NARRATIVETRACE_EXPLAIN;
const titles = skill.steps.map((step) => step.title);
const step = (title: string) => {
  const found = skill.steps.find((s) => s.title === title);
  if (found === undefined) throw new Error(`no step "${title}"`);
  return found;
};
const EXPLAIN = "Explain the run by span id, and mark what you inferred";
const SHAPE = "Read the structural trace first, in the order it ran";

describe("narrativetrace-explain — the catalogue entry", () => {
  it("ships in the catalogue right after the debug skill", () => {
    const names = SKILLS.map((s) => s.canonicalName);
    expect(SKILLS).toContain(skill);
    expect(skill.canonicalName).toBe("narrativetrace-explain");
    expect(names.indexOf("narrativetrace-explain")).toBe(names.indexOf("narrativetrace-debug") + 1);
  });

  it("has the eight steps, in order", () => {
    expect(titles).toEqual([
      "Decide whether the source already answers it, and say so",
      "Choose the one scenario that already exercises the flow",
      "Install tracing first when the project has none",
      "Run that one scenario with tracing on",
      SHAPE,
      "Open values only where the question needs one",
      "Hand off when it stops being an explanation",
      EXPLAIN,
    ]);
  });
});

describe("narrativetrace-explain — the cost rule", () => {
  it("decides first whether the source answers it, and ends there when it does", () => {
    const first = skill.steps[0];
    expect(first?.body).toEqual({ kind: "commands", commands: [] });
    expect(first?.flag).toContain("before anything is installed or run");
    expect(first?.flag).toContain("'reading the source:");
    expect(first?.flag).toContain("'tracing:");
    expect(first?.flag).toContain("no install and no run");
    expect(first?.flag).toContain("the skill ends there");
  });

  it("is an always rule carrying its own reason", () => {
    expect(skill.always).toContain(FROM_THE_SOURCE);
    expect(FROM_THE_SOURCE.rule).toBe(
      "Answer from the source when ten lines of source answer the question",
    );
    expect(FROM_THE_SOURCE.reason).toContain("cost the user time and tokens");
    expect(FROM_THE_SOURCE.reason).toContain("where the path is not obvious");
  });
});

describe("narrativetrace-explain — the reading loop", () => {
  it("chooses ONE scenario and writes a new one only where there is none", () => {
    const scenario = step("Choose the one scenario that already exercises the flow");
    expect(titles.indexOf(scenario.title)).toBe(1);
    expect(scenario.flag).toContain("names ONE scenario");
    expect(scenario.flag).toContain("an existing test");
    expect(scenario.flag).toContain("written only where");
    expect(scenario.flag).toContain("Two scenarios is two traces");
  });

  it("routes an uninstalled project through the install skill before the run", () => {
    const install = step("Install tracing first when the project has none");
    expect(install.condition).toContain("only when the project has no NarrativeTrace at all");
    expect(install.condition).toContain("go straight to the run");
    expect(install.flag).toContain("add-narrative-tracing");
    expect(install.flag).toContain("resumed at the run below");
    expect(install.flag).toContain("does not refactor");
    expect(titles.indexOf(install.title)).toBeLessThan(
      titles.indexOf("Run that one scenario with tracing on"),
    );
  });

  it("runs the scenario as found and routes elsewhere when there is none", () => {
    const run = step("Run that one scenario with tracing on");
    expect(run.body).toEqual({ kind: "commands", commands: [RUN_THE_SCENARIO] });
    expect(run.flag).toContain("wrote a trace of its own");
    expect(run.flag).toContain("a run that writes nothing is the failure below");
    expect(run.flag).toContain("ran as it was found");
    expect(run.condition).toContain("run that one, as it is");
    expect(run.condition).toContain("add-narrative-tracing's own first-trace step");
    expect(run.failure).toHaveLength(1);
    expect(run.failure?.[0]?.fix).toContain("narrativetrace-doctor");
  });

  it("reads the structural trace whole and in order before any value", () => {
    const shape = step(SHAPE);
    const values = step("Open values only where the question needs one");
    expect(shape.body).toEqual({ kind: "commands", commands: [FIND_STRUCTURAL] });
    expect(shape.flag).toContain("read whole before any value");
    expect(shape.flag).toContain("by span id");
    expect(shape.flag).toContain("which branch");
    expect(values.body).toEqual({ kind: "commands", commands: [FIND_NARRATIVES] });
    expect(values.condition).toBe(ONLY_WHAT_THE_QUESTION_NEEDS);
    expect(values.flag).toContain("not the whole file");
    expect(values.flag).toContain("[REDACTED]");
    expect(titles.indexOf(values.title)).toBe(titles.indexOf(SHAPE) + 1);
  });

  it("hands a defect or a change in progress off instead of fixing it here", () => {
    const handOff = step("Hand off when it stops being an explanation");
    expect(handOff.condition).toContain("only when the run shows something wrong");
    expect(handOff.condition).toContain("a change of this session's own");
    expect(handOff.flag).toContain("narrativetrace-debug");
    expect(handOff.flag).toContain("narrativetrace-verify");
    expect(handOff.flag).toContain("fixes nothing itself");
    expect(titles.indexOf(handOff.title)).toBeGreaterThan(titles.indexOf(SHAPE));
    expect(titles.indexOf(handOff.title)).toBeLessThan(titles.indexOf(EXPLAIN));
  });

  it("ends by explaining by span id and naming what was not observed", () => {
    const last = skill.steps.at(-1);
    expect(last?.title).toBe(EXPLAIN);
    expect(last?.flag).toContain("in the user's own words");
    expect(last?.flag).toContain("citing the span id it rests on");
    expect(last?.flag).toContain("a claim without an id is not a claim");
    expect(last?.flag).toContain("marked as an inference");
    expect(last?.flag).toContain("what was NOT observed");
  });

  it("is judged on the reply: every step is judgmental, none promotes anything", () => {
    expect(skill.steps.every((s) => (s.flag ?? "").startsWith("judgmental — "))).toBe(true);
    expect(commandStrings(skill)).toEqual([RUN_THE_SCENARIO, FIND_STRUCTURAL, FIND_NARRATIVES]);
    expect(commandStrings(skill).join("\n")).not.toMatch(/narrativetrace-approve|init/);
  });
});

describe("narrativetrace-explain — shared with verify and debug, never copied", () => {
  it("renders the reading sections the debug skill renders, and no tool is pre-approved", () => {
    expect(skill.references).toEqual([TraceReading.FLAVOURS, TraceReading.SHAPES]);
    expect(skill.references).toEqual(NARRATIVETRACE_DEBUG.references);
    expect(skill.allowedTools).toEqual([]);
    expect(promotionNotPreApproved([skill])).toEqual([]);
  });

  it("forbids inventing observations and changing the code to explain it", () => {
    expect(skill.always.map((r) => r.rule)).toEqual([
      FROM_THE_SOURCE.rule,
      TraceReading.CITE_SPAN_IDS.rule,
      "Separate what the trace showed from what you inferred",
    ]);
    expect(skill.never.map((r) => r.rule)).toEqual([
      "Never present an unobserved call as something the trace showed",
      "Never change the code in order to explain it",
      TraceReading.NEVER_REDACTION_OFF.rule,
    ]);
  });

  it("carries the questions a user asks and fits the description budget", () => {
    expect(skill.description).toContain("'show me what my application actually does'");
    expect(skill.description).toContain("'what does this endpoint call'");
    expect(skill.description).toContain("nothing broken and no change needing verification");
    expect(skill.description).toContain("BEFORE reading source files");
    for (const name of ["add-narrative-tracing", "narrativetrace-debug", "narrativetrace-verify"]) {
      expect(skill.description).toContain(name);
    }
    expect(skill.whenToUse).toContain("Non-obvious triggers");
    expect(descriptionFitsBudget(skill)).toBe(true);
  });

  it("renders in both flavours, the reading sections after the eight steps", () => {
    for (const page of [renderClaudeSkill(skill, () => "x"), renderAgentsSkill(skill, () => "x")]) {
      expect(page).toContain(`## 8. ${EXPLAIN}`);
      expect(page.indexOf("## Which flavour")).toBeGreaterThan(page.indexOf("## 8."));
    }
  });
});
