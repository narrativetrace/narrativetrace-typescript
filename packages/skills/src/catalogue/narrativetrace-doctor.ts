// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";
import {
  APPROVAL_FLOW_DIFF,
  DOCTOR_REPORT_WELL_FORMED,
  OPEN_NEWEST_RENDERED_TRACE,
  REDACTION_PROOF_FINDING_PRESENT,
  REDACTION_TEST_GUIDANCE,
} from "./doctor-commands.js";

const FIXTURE = "examples/sixty-seconds";

/**
 * Diagnosis only. `add-narrative-tracing` owns getting a project to a first trace (install, wrap,
 * render, send to a logger); this skill starts from "something is already wired up" and runs the
 * tested CLI, reads its report, and points at the fix for whichever finding failed.
 */
export const NARRATIVETRACE_DOCTOR: Skill = {
  canonicalName: "narrativetrace-doctor",
  skillClass: "mechanical",
  description:
    "Diagnoses a NarrativeTrace TypeScript install and configuration. Use when nothing is being traced, traces aren't showing up, the vitest config crashes on load, parameter names render as arg0/arg1, or you are not sure NarrativeTrace is wired up correctly. Checks Node/vitest-peer/sibling-package versions, the /reporters subpath, traceObject option shapes, NARRATIVETRACE_OUTPUT, whether any consumer is attached to a traced proxy, whether redaction is proven in a test, and stale approval-trace diffs. Read-only — makes no changes. Say 'check my narrativetrace setup', 'is narrativetrace broken', or 'why isn't anything being traced' to invoke it.",
  whenToUse:
    "A project already has NarrativeTrace installed and something about it is not working, or an agent wants a pre-flight check before wiring it into new code.",
  fixture: FIXTURE,
  allowedTools: ["pnpm", "npx", "node"],
  steps: [
    {
      title: "Run the doctor and read its report",
      // `|| true`: a failing finding is doctor working correctly (there is something to act on),
      // never a crash — the mechanical floor this step's own verify checks is well-formedness,
      // not that every finding passed.
      body: { kind: "commands", commands: ["npx narrativetrace doctor || true"] },
      verify: DOCTOR_REPORT_WELL_FORMED,
      failure: [
        {
          symptom: "the CLI's JSON output does not parse, or is missing findings",
          cause: "the CLI crashed instead of reporting a finding",
          fix: "re-run `npx narrativetrace doctor --json` directly and read the raw output — a crash here is a doctor bug, never a project finding",
        },
      ],
    },
    {
      title: "Prove redaction in a test",
      body: { kind: "commands", commands: [REDACTION_TEST_GUIDANCE] },
      verify: REDACTION_PROOF_FINDING_PRESENT,
      failure: [
        {
          symptom: "a redaction primitive is imported but never asserted on",
          cause: "trusting redaction by inspection instead of proving it in a test",
          fix: 'render a call with a deny-listed parameter name and assert the output contains "[REDACTED]"',
        },
      ],
    },
    {
      title: "Read the rendered trace before asserting",
      body: { kind: "commands", commands: [OPEN_NEWEST_RENDERED_TRACE] },
      // No verify: judgmental — replay confirms a rendered file exists and is opened (the
      // command's own exit code), not that reading it changed anything about the code written next.
    },
    {
      title: "Approval flow: diff the structural trace, not just values",
      body: { kind: "commands", commands: [APPROVAL_FLOW_DIFF] },
      flag: "unstudied — eval cell pending",
    },
  ],
  always: [
    {
      rule: "Run the doctor CLI and read its report before making any change.",
      reason:
        "the tested tooling already computed the finding — re-deriving it by hand risks disagreeing with what ships",
    },
  ],
  never: [
    {
      rule: "Never have this skill edit, generate, or delete a file.",
      reason:
        "narrativetrace-doctor is scoped read-only by design — generation of the redaction-proof test itself is a separate, later skill",
    },
    {
      rule: "Never claim a finding passed without having run the doctor CLI in this session.",
      reason:
        "self-reported success overstates reality — a build claimed green that does not reproduce from clean is not evidence; verify is never 'ask the agent'",
    },
  ],
};
