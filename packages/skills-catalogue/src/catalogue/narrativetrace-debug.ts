// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ReasonedRule, Skill, SkillStep } from "../skill.js";
import { BaselinePin } from "./baseline-pin.js";
import { TraceReading } from "./trace-reading.js";
import { FIND_DIAGRAMS, FIND_NARRATIVES, FIND_STRUCTURAL, REPRODUCE } from "./verify-commands.js";

/** The reproduce step's failure: a run that wrote no narrative for the test. */
const NO_NARRATIVE = {
  symptom: "no .md for the test appears under narrativetrace-output",
  cause:
    "the test is not built with createNarrativeTest, or the collaborators on the path are not wrapped with traceObject and the test's narrativeContext",
  fix: "run narrativetrace-doctor and apply its fix, then run the test again",
};

/**
 * `narrativetrace-debug` — finds the cause of a symptom by reading what the code did with the
 * values, fixes it where it diverged, and pins the reproduction behind the user's yes. Port of Java
 * `NarrativeTraceDebugSkill` (design D4, R2).
 *
 * The loop starts from a symptom, not a change: reproduce it with the smallest input and tracing
 * on; across async work read the sequence diagram first; name, by span id, the first span whose
 * inputs are right and whose result is wrong — before touching code; narrow to that span's
 * sub-tree by wrapping one more collaborator, never by redacting; hand a defect in NarrativeTrace
 * itself to `narrativetrace-feedback`; fix it in that span, re-run the same input, and check the
 * structural trace shows nothing else moved; keep the reproduction as the regression test and pin
 * its structural trace (`BaselinePin`); report the root cause by span id.
 *
 * Unlike `narrativetrace-verify` there is no cost rule that skips the trace: once there is a bug,
 * the trace is the cheap way to find it. Both skills render the same `TraceReading` sections.
 *
 * @llmNote NO allowed tools, as for verify: the pin promotes through `npx`
 * (`promotionNotPreApproved`). In this runtime `@notTraced` (and `traceObject`'s `notTraced`)
 * REDACTS parameters — it never scopes a trace — which is why the bisect step narrows by wrapping
 * one more collaborator instead (Java cross-port item 2). A red run writes no `.nt` (the file on
 * disk is the last green one) but does write the `.md` and diagram, so the shape before the fix is
 * the `.md`'s calls and ids (cross-port item 3).
 */
export const NARRATIVETRACE_DEBUG: Skill = {
  canonicalName: "narrativetrace-debug",
  skillClass: "guided",
  description:
    "Finds the cause of a wrong result in a TypeScript project by reading what the code did with the values, not by stepping through it. Use when a symptom is reported — a wrong amount, a wrong id, a call in the wrong order, a test that fails with a value nobody expected. Reproduces it with the smallest input and NarrativeTrace on, finds the first span where a value diverges and names it by its span id (the sequence diagram first when async work is involved), narrows to that span's sub-tree, fixes it there and checks the structural trace shows nothing else moved, pins the reproduction as a regression test and an approval baseline behind your yes, and reports the root cause by span id. Hands a defect in NarrativeTrace itself to narrativetrace-feedback. Say 'debug this with the trace', 'find where this value goes wrong', or 'why is this result wrong' to invoke it.",
  whenToUse:
    "Non-obvious triggers: a support ticket quoting a wrong amount or total; a rounding, currency or timezone difference between what was expected and what happened; a value that is right going into a service and wrong coming out; a flaky ordering between async tasks.",
  fixture: "examples/sixty-seconds",
  allowedTools: [],
  steps: [
    reproduce(),
    symptom(),
    diagram(),
    localize(),
    bisect(),
    handOff(),
    fix(),
    delta(),
    keep(),
    ...BaselinePin.steps(),
    report(),
  ],
  always: [
    TraceReading.CITE_SPAN_IDS,
    {
      rule: "Narrow to one span before reading its values",
      reason:
        "debugging is where values pay for themselves, but only on the span that diverged — a whole trace of values buries the one that matters",
    },
    BaselinePin.SHOW_THE_WHOLE_RECEIVED,
  ],
  never: never(),
  references: [TraceReading.FLAVOURS, TraceReading.SHAPES],
};

function never(): readonly ReasonedRule[] {
  return [
    {
      rule: "Never change code before the diverging span is named",
      reason:
        "a fix made before the trace says where the value went wrong is a guess, and a guess that turns the test green hides the defect it missed",
    },
    {
      rule: "Never make the symptom go away somewhere other than the diverging span",
      reason:
        "a correction downstream, a caught exception or a changed expectation silences the symptom and leaves the defect for the next caller of that span",
    },
    TraceReading.NEVER_REDACTION_OFF,
    ...BaselinePin.NEVER,
  ];
}

function reproduce(): SkillStep {
  return {
    title: "Reproduce the symptom with tracing on",
    body: {
      kind: "snippet",
      path: "examples/sixty-seconds/__tests__/place-order-flow.test.ts",
      language: "ts",
    },
    verify: REPRODUCE,
    condition:
      "a test already drives the path with the input from the symptom, run that one; otherwise write the smallest one, as below — the reported input, through the real collaborators each wrapped with traceObject and the test's narrativeContext, asserting the value the symptom says should have come out",
    failure: [NO_NARRATIVE],
  };
}

function symptom(): SkillStep {
  return {
    title: "Find the symptom in the values",
    body: { kind: "commands", commands: [FIND_NARRATIVES] },
    flag: "judgmental — the reported value is in this run's .md narrative, or the reproducing test fails on it — a symptom that does not reproduce is said so, and the loop stops here",
  };
}

function diagram(): SkillStep {
  return {
    title: "Across async work, read the sequence diagram first",
    body: { kind: "commands", commands: [FIND_DIAGRAMS] },
    condition:
      "only when the path crosses async work — the .nt shows a fork, async or fire-and-forget marker — or the symptom is about order (a call that ran before or after another); otherwise go straight to localizing",
    flag: "judgmental — the reproduction's .mmd was read before any span's values, and the reply says which call ran before which, by the span id in each call's note — the span it points to is the one localized next",
  };
}

function localize(): SkillStep {
  return {
    title: "Localize by reading: name the first span where a value diverges",
    body: { kind: "commands", commands: [] },
    flag: "judgmental — the reproduction's .md spans were read from the root down until the first one whose inputs are what the symptom implies but whose result, the value it passes on, or the branch it takes is not; the reply names that span by its id (#1.3) and the boundary — the collaborator, the parameter or return, the value that arrived and the value that left — before any code is changed: by reading, not by stepping through a debugger or adding console.log",
  };
}

function bisect(): SkillStep {
  return {
    title: "Bisect by span, not by file",
    body: { kind: "commands", commands: [REPRODUCE] },
    condition:
      "only when the value went into the diverging span right and came out wrong, and what happens in between is more than that span's own few lines; otherwise the diverging span is the defect — go on to the fix",
    flag: "judgmental — only the sub-tree under the diverging id was read on each re-run — the spans whose id begins with it (#1.3, #1.3.1, #1.3.2) — and where the work inside that span is not traced, the collaborator it calls was wrapped with traceObject in the reproducing test, as the listing above wraps its collaborators, and the run repeated, until the divergence sits in the smallest span that has it; never @notTraced to narrow — in this runtime it redacts a parameter, it does not scope a trace",
  };
}

function handOff(): SkillStep {
  return {
    title: "Hand a defect in NarrativeTrace itself to narrativetrace-feedback",
    body: { kind: "commands", commands: [] },
    condition:
      "only when the trace and the code disagree — a call the code makes has no span, a span shows a value the code did not pass, one span has two ids in two flavours — or the diverging span is inside NarrativeTrace; otherwise go on to the fix",
    flag: "judgmental — narrativetrace-feedback was started with the span id and the value-free .nt — never a value from the trace — and the project's code was not changed to work around it; the loop ends with that hand-off",
  };
}

function fix(): SkillStep {
  return {
    title: "Fix it in the diverging span, re-run the same input, read the same span",
    body: { kind: "commands", commands: [REPRODUCE] },
    flag: "judgmental — the change is in the code of that span — the method the diverging id names, or what it calls — and the reproducing test passes; the same span, by the same id, now carries the value the symptom implied; a change anywhere else that makes the test pass silences the symptom and leaves the defect, so it is undone",
  };
}

function delta(): SkillStep {
  return {
    title: "Check that nothing else moved",
    body: { kind: "commands", commands: [FIND_STRUCTURAL] },
    flag: "judgmental — the fixed run's .nt was read whole and compared, line by line, with the call lines of the reproduction's .md — a red run writes no .nt (the .nt on disk is the last green one), so the shape before the fix is the .md's calls and ids without their values: the same calls in the same order under the same ids; a value fix moves no line of a value-free trace, and every line that did move is named by its id in the reply and either explained by the fix or undone",
  };
}

function keep(): SkillStep {
  return {
    title: "Keep the reproduction as the regression test",
    body: { kind: "commands", commands: [] },
    flag: "judgmental — the reproducing test stays in the suite with the input from the symptom and asserts the value the fixed span now carries — not only that nothing throws — so it fails when the fix is undone; its structural trace is what the pin below makes the baseline",
  };
}

function report(): SkillStep {
  return {
    title: "Report the root cause as the trace showed it",
    body: { kind: "commands", commands: [] },
    flag: "judgmental — the root cause in the user's own terms — the span id where it diverged, the value that arrived and the value that left, the branch it took — and what the fix changed in that span; every claim cites the span id it rests on, from the .nt or .md read in this session: a claim without an id is not a claim. The report is written in full before the pin question, where the gate puts it, and the closing reply after the promotion names the span id again in its one-line summary of the cause",
  };
}
