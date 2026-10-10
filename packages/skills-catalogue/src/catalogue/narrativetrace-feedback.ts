// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";
import { ApprovalGate } from "./approval-gate.js";
import { DOCTOR_REPORT_WELL_FORMED } from "./doctor-commands.js";
import {
  DRAFT_FILES_WRITTEN,
  DRAFT_REPORT,
  DRAFT_SHOWN_WHOLE,
  PRINT_URL,
  QUESTION_ASKED_LAST,
  SHOW_DRAFT,
  URL_PRINTED,
} from "./feedback-commands.js";

/**
 * Reports a defect in NarrativeTrace itself, with the user's approval and nothing else.
 *
 * The shape is the whole point: draft, SHOW the draft in full, ask one question, stop the turn.
 * Filing is public and permanent, so the decision has to be the user's in a turn of their own — not
 * inferred from the turn that asked, and not from a summary of a report they never saw.
 *
 * @llmNote This skill declares NO allowed tools, and that is a safety property rather than an
 * omission. A Claude-flavour `allowed-tools` grants its listed tools for the turn that loads the
 * skill, without prompting — so a skill that declared `npx` would pre-approve its own reporting
 * command. `publishingNotPreApproved` in `../lints.ts` fails the build if that is ever added back.
 */
export const NARRATIVETRACE_FEEDBACK: Skill = {
  canonicalName: "narrativetrace-feedback",
  skillClass: "guided",
  description:
    "Reports a defect in NarrativeTrace itself — the library, the doctor, an agent skill, or the published install prompt. Use when a doctor finding is wrong or its fix does not work, when a skill step cannot be followed or its verify cannot be met, when the install prompt is wrong, or when the library misbehaves and the project is configured correctly. Drafts the report from this project (the install coordinates, the doctor's own JSON report, and at most one structural trace), refuses to write one that carries a value from your traces and names the rule that refused it, shows you the whole draft, and then asks once whether to file it publicly. Files nothing without your answer and sends nothing anywhere. Say 'report this to NarrativeTrace', 'the doctor's fix did not work', or 'file a bug about this skill' to invoke it.",
  whenToUse:
    "Non-obvious triggers: a doctor fix that leaves the same finding failing; a skill step whose verify cannot be met on a correctly configured project; wording in the install prompt that led somewhere wrong.",
  fixture: "examples/sixty-seconds",
  allowedTools: [],
  steps: [
    {
      title: "Gather what the report needs",
      body: { kind: "commands", commands: ["npx @narrativetrace/cli doctor || true"] },
      verify: DOCTOR_REPORT_WELL_FORMED,
      failure: [
        {
          symptom: "the doctor's JSON output does not parse, or is missing findings",
          cause: "the CLI crashed instead of reporting a finding",
          fix: "report that crash under the `doctor` category — a crash here is a doctor bug, never a project finding",
        },
      ],
    },
    {
      title: "Draft the report and let the gate check it",
      body: { kind: "commands", commands: [DRAFT_REPORT] },
      verify: DRAFT_FILES_WRITTEN,
      failure: [
        {
          symptom: 'the command exits 2 saying: unknown category "..."',
          cause:
            "the category is the part of NarrativeTrace the problem is in, and it is one of four words",
          fix: "use prompt, skill, doctor or library — the install prompt, an agent skill, a doctor check, or the library itself",
        },
        {
          symptom: "the command exits 2 naming a vf.* rule",
          cause:
            "a field carries a value from this project's own run — a rendered call line, an elapsed time, a credential-shaped string, an address",
          fix: "rewrite that one field to describe what happened instead of pasting it, and draft again; never work around the rule by moving the text to another field",
        },
      ],
    },
    {
      title: "Show the whole draft, not a summary of it",
      body: { kind: "commands", commands: [SHOW_DRAFT] },
      flag: DRAFT_SHOWN_WHOLE,
    },
    {
      title: "Ask once whether to file it, then stop the turn",
      body: { kind: "commands", commands: [] },
      flag: QUESTION_ASKED_LAST,
    },
    {
      title: "Print the way to file it, and nothing else",
      body: { kind: "commands", commands: [PRINT_URL] },
      flag: URL_PRINTED,
    },
  ],
  always: [
    ApprovalGate.showTheWholeBeforeAsking(
      "draft",
      "filing is public and permanent, and a person can only approve what they have actually read",
    ),
    {
      rule: "Ask in the user's own language",
      reason:
        "the report may be written in any language, and a question nobody understands is not a question",
    },
    {
      rule: "Pass --language with the report's language tag whenever it is not English",
      reason:
        "the form is English and the report is not, so the language field and label are what lets a maintainer route it to someone who reads it",
    },
    {
      rule: "Tell the user that filing is public, under their own account, before they answer",
      reason:
        "a public issue shows that their project uses NarrativeTrace, and that is their decision to make knowingly",
    },
  ],
  never: [
    {
      rule: "Never attach a rendered trace, a log file or a source file",
      reason:
        "those carry the values from the user's own run; the structural trace carries the same shape of the same call without any of them, and the verb attaches it on its own",
    },
    ApprovalGate.neverInTheTurnThatAsked("file"),
    ApprovalGate.neverEditAfterShowing("draft", "filed", "report is drafted"),
    {
      rule: "Never open the URL or run the printed command",
      reason:
        "submitting is the user's act, in their own browser or their own shell, under their own account",
    },
    {
      rule: "Never route a rule's refusal around the gate",
      reason:
        "a field that cannot be filed is a field to rewrite, not to move somewhere the rule does not look",
    },
  ],
};
