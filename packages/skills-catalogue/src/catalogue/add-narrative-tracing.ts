// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";
import {
  APPLY_FRAMEWORK_FIXES,
  DOCTOR_REPORT_WELL_FORMED,
  FRAMEWORK_FINDINGS_HOLD,
  INIT_PREVIEW_PRODUCED_A_DIFF,
  RUN_DOCTOR,
  TOOLCHAIN_CHECKS_HOLD,
} from "./doctor-commands.js";

const FIXTURE = "examples/sixty-seconds";

/**
 * Step 1's condition (Phase 6, D2). Names no framework: whether the project already has an entry
 * point is read from its manifest and the doctor's report, never from a list on this page. A
 * `main`, `bin` or start script is what the project's deliverable runs, so rewriting one to start
 * a demo replaces the deliverable.
 */
const ENTRY_POINT_KEEPS_ITS_SCRIPTS =
  "if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — add only the dependencies and leave the project's `main` field and start scripts as they are; otherwise install as written";

/**
 * Step 3's condition (Phase 6, D2): in a project that already starts itself, the first trace is one
 * real boundary's, read from the application the way it already runs — never a demo file.
 */
const ENTRY_POINT_RUNS_ITSELF =
  "if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — do not add a demo file: run the application the way it already runs, exercise one real boundary, and read that request's trace; the verify below is for the console demo, and in an existing application the step is done when that request's trace is in the output; otherwise create the smallest console demo as follows";

/**
 * Getting a project from zero to a first trace reaching a real logger. Diagnosing an install that
 * is already wired up but not working is `narrativetrace-doctor`'s job, not this skill's — this
 * skill's last step is handing off to it.
 *
 * Right after the install, ONE step hands framework wiring to the doctor (Phase 6, D2 as amended):
 * run it, apply every `config.<framework>-*` fix in order. The page names no framework — the
 * installed doctor's own framework table is the oracle, so a release that adds a row reaches
 * existing projects through the doctor, never through a stale skill page.
 *
 * Amendment (skills P1, carried from the pre-split catalogue): the install step's verify must
 * reinstall clean, but `npm` is outside this port's closed command vocabulary (pnpm/npx/node/git),
 * and the fixture is a pnpm workspace member, where `npm ci` is actively wrong (it does not
 * understand `workspace:*`). The port-vocabulary-safe equivalent replayed here is `pnpm install
 * --frozen-lockfile`; a real consumer's own package manager is unaffected — this only changes what
 * the SKILL's own replay executes against ITS OWN fixture.
 */
export const ADD_NARRATIVE_TRACING: Skill = {
  canonicalName: "add-narrative-tracing",
  skillClass: "mechanical",
  description:
    "Installs NarrativeTrace into a TypeScript project and gets it to a first trace. Use when NarrativeTrace is not yet installed, a project needs its very first traced call, or traces need to reach a real logger instead of a bare console.log. Installs @narrativetrace/core-node and @narrativetrace/proxy with the project's real package manager, wraps a class with traceObject, renders and runs the first trace, then sends it to a real logger (pino, in the worked example). Applies the doctor's framework-wiring fixes for the frameworks the project already uses, and runs narrativetrace doctor to confirm the install is correctly wired — narrativetrace-doctor owns diagnosis from there — then previews installing the NarrativeTrace agent skills for next time (`narrativetrace init --dry-run`); applying that preview is left to the reader. Say 'add narrative tracing to my service', 'install narrativetrace', 'get a trace in 60 seconds', 'wrap this class so I can see a trace', or 'send my traces to my logger' to invoke it.",
  whenToUse:
    "A project does not have NarrativeTrace yet, or has the packages installed but has never produced a trace, or traces print to the console but nothing forwards them to a real logger.",
  fixture: FIXTURE,
  allowedTools: ["pnpm", "npx", "node"],
  steps: [
    {
      title: "Install with the real toolchain",
      body: { kind: "commands", commands: ["pnpm install --frozen-lockfile"] },
      verify: TOOLCHAIN_CHECKS_HOLD,
      condition: ENTRY_POINT_KEEPS_ITS_SCRIPTS,
      failure: [
        {
          symptom: "vitest peer mismatch breaks the library's own build from a clean install",
          cause: "an installed vitest version outside @narrativetrace/vitest's declared peer range",
          fix: "run the narrativetrace-doctor skill's toolchain.vitest-peer check, then install a version satisfying the printed range",
        },
      ],
    },
    {
      title: "Wire the frameworks this project already uses",
      body: { kind: "commands", commands: [RUN_DOCTOR] },
      verify: FRAMEWORK_FINDINGS_HOLD,
      failure: [
        {
          symptom: "the verify exits 1, printing the config.<framework>-* findings that fail",
          cause:
            "the project uses a framework whose NarrativeTrace integration is not installed, or is installed but never wired",
          fix: APPLY_FRAMEWORK_FIXES,
        },
      ],
    },
    {
      title: "First trace: wrap, call, render, run",
      body: { kind: "snippet", path: "examples/sixty-seconds/index.js", language: "js" },
      verify: "node index.js",
      condition: ENTRY_POINT_RUNS_ITSELF,
      failure: [
        {
          symptom: "parameters render as arg0, arg1, ...",
          cause:
            "parameter names of a class you don't own (or a build that strips them) are lost at compile time",
          fix: 'pass them explicitly: traceObject(target, context, { methodName: ["paramA", "paramB"] })',
        },
      ],
    },
    {
      title: "Send it to your logger",
      body: {
        kind: "snippet",
        path: "examples/sixty-seconds/index-with-logger.js",
        language: "js",
      },
      verify: "node index-with-logger.js",
    },
    {
      title: "Run the doctor and resolve its findings",
      // The seam between the two skills: this step's own claim is "doctor ran and produced a
      // well-formed report to act on" — resolving each finding is narrativetrace-doctor's job.
      body: { kind: "commands", commands: [RUN_DOCTOR] },
      verify: DOCTOR_REPORT_WELL_FORMED,
    },
    {
      title: "Install the skills for next time",
      // Preview only — never the applying form. The prompt's own step 3 human gate says apply
      // only once a person has seen the diff; this skill shows it and stops.
      body: { kind: "commands", commands: ["npx @narrativetrace/cli init --dry-run"] },
      verify: INIT_PREVIEW_PRODUCED_A_DIFF,
      // The install's hand-off to the session after this one (Phase 7 D7, Java
      // NEXT_SESSION_VERIFIES): this step's verify is a command here, so the hand-off is its flag.
      flag: "judgmental — the reply names the hand-off: the next session verifies with narrativetrace-verify — once a change's tests are green, it reads the trace before it reports",
    },
  ],
  always: [
    {
      rule: "Reinstall clean (a frozen-lockfile install) rather than trusting whatever is already in node_modules.",
      reason:
        "a mismatched peer or stale lockfile is the single most common install failure, and it only surfaces on a clean install",
    },
  ],
  never: [
    {
      rule: "Never assume a step worked without running its verify.",
      reason:
        "self-reported success overstates reality — a build claimed green that does not reproduce from clean is not evidence",
    },
    {
      rule: "Never skip the final narrativetrace doctor call.",
      reason:
        "it is the seam that catches anything the steps before it did not — narrativetrace-doctor owns diagnosis from here",
    },
    {
      rule: "Never run `narrativetrace init` without `--dry-run` from this skill.",
      reason:
        "the prompt's own step 3 human gate applies the plan only after a person has seen the diff — this skill only shows it",
    },
  ],
};
