// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";
import { DOCTOR_REPORT_WELL_FORMED, TOOLCHAIN_CHECKS_HOLD } from "./doctor-commands.js";

const FIXTURE = "examples/sixty-seconds";

/**
 * Getting a project from zero to a first trace reaching a real logger. Diagnosing an install that
 * is already wired up but not working is `narrativetrace-doctor`'s job, not this skill's — this
 * skill's last step is handing off to it.
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
  claudeSegment: "add",
  skillClass: "mechanical",
  description:
    "Installs NarrativeTrace into a TypeScript project and gets it to a first trace. Use when NarrativeTrace is not yet installed, a project needs its very first traced call, or traces need to reach a real logger instead of a bare console.log. Installs @narrativetrace/core-node and @narrativetrace/proxy with the project's real package manager, wraps a class with traceObject, renders and runs the first trace, then wires a pino/winston/OpenTelemetry-style consumer so traces reach your logger. Ends by running narrativetrace doctor to confirm the install is correctly wired — narrativetrace-doctor owns diagnosis from there. Say 'add narrative tracing to my service', 'install narrativetrace', 'get a trace in 60 seconds', 'wrap this class so I can see a trace', or 'send my traces to my logger' to invoke it.",
  whenToUse:
    "A project does not have NarrativeTrace yet, or has the packages installed but has never produced a trace, or traces print to the console but nothing forwards them to a real logger.",
  fixture: FIXTURE,
  allowedTools: ["pnpm", "npx", "node"],
  steps: [
    {
      title: "Install with the real toolchain",
      body: { kind: "commands", commands: ["pnpm install --frozen-lockfile"] },
      verify: TOOLCHAIN_CHECKS_HOLD,
      failure: [
        {
          symptom: "vitest peer mismatch breaks the library's own build from a clean install",
          cause: "an installed vitest version outside @narrativetrace/vitest's declared peer range",
          fix: "run the narrativetrace-doctor skill's toolchain.vitest-peer check, then install a version satisfying the printed range",
        },
      ],
    },
    {
      title: "First trace: wrap, call, render, run",
      body: { kind: "snippet", path: "examples/sixty-seconds/index.js", language: "js" },
      verify: "node index.js",
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
      body: { kind: "commands", commands: ["npx narrativetrace doctor || true"] },
      verify: DOCTOR_REPORT_WELL_FORMED,
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
        "it is the seam that catches anything these four steps did not — narrativetrace-doctor owns diagnosis from here",
    },
  ],
};
