// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ReasonedRule, Skill, SkillStep } from "../skill.js";
import { BaselinePin } from "./baseline-pin.js";
import { TraceReading } from "./trace-reading.js";
import { FIND_NARRATIVES, FIND_STRUCTURAL, RUN_THE_PATH } from "./verify-commands.js";

/** Values, the fix and the re-read happen only when the structural read found a mismatch. */
export const ONLY_ON_A_MISMATCH =
  "only when the structural read named a span that does not match the intent; otherwise go on to the pin";

/** The run step's failure: a run that wrote no structural trace. */
const NO_STRUCTURAL_TRACE = {
  symptom: "no .nt for the test appears under narrativetrace-output/structural",
  cause:
    "the test is not built with createNarrativeTest, or the collaborators on the path are not wrapped with traceObject and the test's narrativeContext",
  fix: "run narrativetrace-doctor and apply its fix, then run the test again",
};

/**
 * `narrativetrace-verify` — reads what a change actually did before the agent says it is done, and
 * pins the result as an approval baseline behind the user's yes. Port of Java
 * `NarrativeTraceVerifySkill` (design D1–D3, D5, D8).
 *
 * The loop runs after the tests are green and before the report: decide whether the change is
 * worth tracing and say so (a pure function is not); write the intent down BEFORE the run, because
 * a trace read against nothing confirms whatever happened; run the smallest real path; read the
 * value-free structural trace against the intent; open values only on the span that looks wrong;
 * fix and re-read; pin; report what the trace showed, citing span ids.
 *
 * The pin is the feedback skill's approval gate, in its words (`ApprovalGate`): show the whole
 * `.received.nt`, ask once and stop the turn, promote exactly what was shown — four steps so each
 * part of the gate has its own flag.
 *
 * @llmNote This skill declares NO allowed tools, and that is a safety property: the promotion runs
 * through `npx`, so pre-approving it would pre-approve the promotion in the turn the gate says must
 * stop. `promotionNotPreApproved` in `../lints.ts` fails the build if a tool is ever added.
 */
export const NARRATIVETRACE_VERIFY: Skill = {
  canonicalName: "narrativetrace-verify",
  skillClass: "guided",
  description:
    "Verifies a change in a TypeScript project by reading what the code actually did before saying it is done. Use after the tests are green and before reporting a change that crosses collaborators, branches, retries, runs async, carries state between calls, or touches code not written in this session — and skip it, saying why, for a pure function or a one-class edit. Writes the intent down first, runs the smallest real path with NarrativeTrace on, reads the value-free structural trace against the intent, opens values only on the span that looks wrong, fixes and re-reads, then pins the flow as an approval baseline behind your yes and reports what the trace showed, citing span ids. Say 'verify this change with the trace', 'check what the code actually did', 'did the flow do what I meant', or 'pin this flow as a baseline' to invoke it.",
  whenToUse:
    "Non-obvious triggers: the suite is green but the change touched more call sites than it added; a notification, payment or retry path changed; a .received.nt appeared after a test run; you are about to write 'tests pass' as the whole report.",
  fixture: "examples/sixty-seconds",
  allowedTools: [],
  steps: [
    decide(),
    intent(),
    run(),
    readStructure(),
    ...onAMismatch(),
    ...BaselinePin.steps(),
    report(),
  ],
  always: [
    TraceReading.CITE_SPAN_IDS,
    {
      rule: "Use the cheapest flavour that answers the question",
      reason:
        "the structural trace first and a value on one span only is what keeps the common case near zero tokens",
    },
    BaselinePin.SHOW_THE_WHOLE_RECEIVED,
  ],
  never: never(),
  references: [TraceReading.FLAVOURS, TraceReading.SHAPES],
};

function never(): readonly ReasonedRule[] {
  return [
    {
      rule: "Never report a change as done on green tests alone once this skill decided to trace",
      reason: "the suite checks what someone thought to assert; the trace shows what the code did",
    },
    {
      rule: "Never read a trace against nothing",
      reason:
        "an intent written after the run bends to whatever happened — that is why it comes first",
    },
    TraceReading.NEVER_REDACTION_OFF,
    ...BaselinePin.NEVER,
  ];
}

function decide(): SkillStep {
  return {
    title: "Decide whether to trace, and say so",
    body: { kind: "commands", commands: [] },
    flag: "judgmental — before anything runs, the reply says which it is: 'tracing: <the reason>' when the change crosses two or more collaborators over a boundary, branches, retries, runs async or concurrently, carries state between calls, touched more call sites than it added, or includes code not written in this session; or 'skipping narrativetrace-verify: <a pure function | a one-class edit with no collaborator | a flow one test already walks end to end>' — a skip ends the skill here, and that sentence is the report. A whole flow's .nt is dozens of lines: cheap where the path is not obvious, waste where it is",
  };
}

function intent(): SkillStep {
  return {
    title: "Write the intent down before running anything",
    body: { kind: "commands", commands: [] },
    flag: "judgmental — three to six lines in the reply, under the word Intent, written before the first traced run: which collaborators the change touches, in which order, under which branch, how many times — the oracle the trace is read against, never edited after the run",
  };
}

function run(): SkillStep {
  return {
    title: "Run the smallest real path with tracing on",
    body: {
      kind: "snippet",
      path: "examples/sixty-seconds/__tests__/place-order-flow.test.ts",
      language: "ts",
    },
    verify: RUN_THE_PATH,
    condition:
      "the project already has a test that drives the changed path through its real collaborators, run that one — again, if it already ran: a trace from a run made before the Intent was written does not count; otherwise write the smallest one, as below",
    failure: [NO_STRUCTURAL_TRACE],
  };
}

function readStructure(): SkillStep {
  return {
    title: "Read the structural trace first, against the intent",
    body: { kind: "commands", commands: [FIND_STRUCTURAL] },
    flag: "judgmental — the .nt of the test just run was opened and read whole before any value was looked at, and the reply walks it against the intent — calls, order, branch, multiplicity — naming every match and every mismatch by its span id (#2.1); the shapes below are the checklist",
  };
}

function onAMismatch(): readonly SkillStep[] {
  return [
    {
      title: "Open values on the span that looks wrong, and only there",
      body: { kind: "commands", commands: [FIND_NARRATIVES] },
      condition: ONLY_ON_A_MISMATCH,
      flag: "judgmental — only the flagged span was read in the .md narrative, found by the id the .nt gave it — not the whole file; a [REDACTED] value stays redacted",
    },
    {
      title: "Fix, re-run, read again",
      body: { kind: "commands", commands: [RUN_THE_PATH] },
      condition: ONLY_ON_A_MISMATCH,
      flag: "judgmental — the same test ran again after the fix and its new .nt was read whole: the span that was wrong now matches the intent, and a fix that changed the shape was read again from the structural read",
    },
  ];
}

function report(): SkillStep {
  return {
    title: "Report what the trace showed",
    body: { kind: "commands", commands: [] },
    flag: "judgmental — two sentences on what the trace showed, every claim citing the span id it rests on — a claim without an id is not a claim, and only ids in the .nt that was read count — with the .nt attached or quoted; 'tests pass' alone is not the report",
  };
}
