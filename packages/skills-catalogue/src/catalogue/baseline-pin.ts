// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ReasonedRule, SkillStep } from "../skill.js";
import { ApprovalGate } from "./approval-gate.js";
import { APPROVE, RUN_THE_SUITE, SHOW_RECEIVED } from "./verify-commands.js";

/**
 * The pin — a structural trace promoted to a committed `.approved.nt` behind the user's yes — as
 * the four steps every skill that pins renders: approval mode on, run and show, ask and stop,
 * promote. Port of Java `BaselinePin`.
 *
 * INTENT: the verify skill pins a flow it checked and the debug skill pins the regression it fixed;
 * it is the same act on the same artifact behind the same gate ({@link ApprovalGate}), so it is
 * written once.
 *
 * @remarks The approval run is the WHOLE suite, never the one test the skill ran: approval mode
 * compares every traced test, so a one-test run leaves every other traced test without a baseline
 * and the suite red (found by Java's trials, cross-port item 1 of its milestone 2).
 */
export const BaselinePin = {
  /** The pin's "always" rule: the whole review copy is shown before the question. */
  SHOW_THE_WHOLE_RECEIVED: ApprovalGate.showTheWholeBeforeAsking(
    ".received.nt",
    "the baseline becomes the contract every later change is held to, and a person can only approve what they have actually read",
  ),

  /** The pin's "never" rules, in the order the pages list them. */
  NEVER: [
    ApprovalGate.neverInTheTurnThatAsked("promote a baseline"),
    ApprovalGate.neverEditAfterShowing(".received.nt", "promoted", "run is rendered"),
    {
      rule: "Never commit a .received.nt",
      reason: "it is the review copy; the committed contract is the .approved.nt",
    },
  ] as readonly ReasonedRule[],

  /** The four pin steps, in order. */
  steps(): readonly SkillStep[] {
    return [APPROVAL_MODE_ON, RUN_AND_SHOW, ASK_AND_STOP, PROMOTE];
  },
} as const;

const APPROVAL_MODE_ON: SkillStep = {
  title: "Turn approval mode on",
  body: {
    kind: "code",
    language: "ts",
    code: "// the test file, or the shared helper your traced tests use\nconst test = createNarrativeTest({ approval: true });",
  },
  condition:
    "if approval mode is off — no createNarrativeTest({ approval: true }), no NARRATIVETRACE_APPROVAL=true in the test run, or the doctor's config.approval-mode finding fails; when it is already on, go straight to the run",
  flag: "judgmental — the traced tests run with approval mode on (the option above, or NARRATIVETRACE_APPROVAL=true in the package.json test script), and .gitignore carries the line narratives/**/*.received.nt so a review copy is never committed",
  failure: [
    {
      symptom: "npx narrativetrace-approve is not found",
      cause:
        "@narrativetrace/vitest is not installed in this project, so neither the option nor the approve command exists",
      fix: "install @narrativetrace/vitest as a dev dependency with the project's package manager and run again",
    },
  ],
};

const RUN_AND_SHOW: SkillStep = {
  title: "Run the suite in approval mode and show every .received.nt",
  body: { kind: "commands", commands: [RUN_THE_SUITE, SHOW_RECEIVED] },
  flag: `judgmental — approval mode compares every traced test, not only the one this skill ran, so the run that writes the review copies is the whole suite; the first run of a test with no baseline fails on purpose — that failure is what writes its review copy — and ${ApprovalGate.shownWhole("each .received.nt that run wrote")} — it holds names and shape and no value, which is why it is safe to commit once approved; where a .approved.nt already existed, the reply also names what the delta changed, by span id, in the program's own words, and whether it was meant`,
};

const ASK_AND_STOP: SkillStep = {
  title: "Ask once whether to pin it, then stop the turn",
  body: { kind: "commands", commands: [] },
  flag: ApprovalGate.askedThenStopped(
    "Do not run npx narrativetrace-approve before the user says yes — promoting is the pinning. And everything else — the report, every caveat, what approving means — goes before the question; the question is the reply's last line, with no sentence after it: write the explanation first, then ask. The final line is the question alone, such as 'Pin this flow as the baseline?' — nothing after its question mark: not what happens after a yes, not the command it would run, not a parenthetical, a note or an offer.",
  ),
};

const PROMOTE: SkillStep = {
  title: "Promote what was shown, and nothing else",
  body: { kind: "commands", commands: [APPROVE] },
  flag: "judgmental — each .approved.nt now holds exactly the text that was shown and no .received.nt is left beside it — git status --short narratives lists the new or changed .approved.nt files and nothing else; those are what get committed — and npx vitest run passes: the suite is green again after the promotion",
};
