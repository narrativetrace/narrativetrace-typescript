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

const FIXTURE = "packages/skills-catalogue/evals/fixtures/empty-project";

/**
 * Step 1's condition (Phase 6, D2). Names no framework: whether the project already has an entry
 * point is read from its manifest and the doctor's report, never from a list on this page. A
 * `main`, `bin` or start script is what the project's deliverable runs, so rewriting one to start
 * a demo replaces the deliverable.
 */
const ENTRY_POINT_KEEPS_ITS_SCRIPTS =
  "if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — add only the dependencies and leave the project's `main` field and start scripts as they are; otherwise install as written";

/**
 * The module-type step's condition (B-87): `"type": "module"` is set only where nothing already
 * decided the project's module system — an existing application keeps its own, and the snippets
 * are then written in its form.
 */
const ENTRY_POINT_KEEPS_ITS_MODULE_SYSTEM =
  "if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — leave its `type` field as it is: the module system is the project's, and the snippets below then follow it (`import` in an ES module, `require` in CommonJS, or the snippet saved as an `.mjs` file); otherwise make the project an ES module as follows";

/** Sets `"type": "module"` in `package.json`, keeping every other field — `node -e`, in the vocabulary. */
const SET_MODULE_TYPE =
  "node -e \"const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.type='module';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\\n')\"";

const MODULE_TYPE_IS_SET =
  "node -e \"if(require('./package.json').type!=='module'){console.error('package.json has no \\\"type\\\": \\\"module\\\"');process.exit(1);}\"";

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
 * The install, from zero (B-87): the page ADDS the packages — `pnpm add` of core-node and proxy,
 * then a frozen-lockfile install as the CHECK that the lockfile it wrote reproduces — and adds the
 * pino bridge in a step of its own right before the logger snippet, so a reader who stops at the
 * first trace installs no logger. pnpm is the manager the page spells because the port's closed
 * command vocabulary is pnpm/npx/node (`allowedTools`); the install step's failure note says how a
 * project on npm or yarn does the same. The page used to say only `pnpm install --frozen-lockfile`
 * and was proven only in examples/sixty-seconds, a workspace member that already declares every
 * package — the one project where a page that never installs anything still passes. Its Tier A2
 * replay therefore runs COLD: its fixture (an empty project) copied outside the repository, the
 * `@narrativetrace` scope served from this checkout's packed packages through the project's own
 * `.npmrc` (`cold-install-replay.test.ts`).
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
      body: {
        kind: "commands",
        commands: [
          "pnpm add @narrativetrace/core-node @narrativetrace/proxy",
          "pnpm install --frozen-lockfile",
        ],
      },
      verify: TOOLCHAIN_CHECKS_HOLD,
      condition: ENTRY_POINT_KEEPS_ITS_SCRIPTS,
      failure: [
        {
          symptom:
            "the project has a package-lock.json or yarn.lock rather than a pnpm-lock.yaml, or `pnpm add` just wrote a pnpm-lock.yaml beside one",
          cause:
            "this page spells its commands in pnpm, and the project uses another package manager",
          fix: "remove the pnpm-lock.yaml pnpm wrote; a project on npm or yarn adds the same two packages with its own add command and checks with its own clean install — the doctor prints the install line of each of its own fixes for the manager it detects",
        },
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
      title: "Make the project an ES module",
      body: { kind: "commands", commands: [SET_MODULE_TYPE] },
      verify: MODULE_TYPE_IS_SET,
      condition: ENTRY_POINT_KEEPS_ITS_MODULE_SYSTEM,
      failure: [
        {
          symptom:
            "`node index.js` throws `SyntaxError: Cannot use import statement outside a module` (a Node release that detects module syntax prints a MODULE_TYPELESS_PACKAGE_JSON warning instead and reparses)",
          cause:
            'package.json has no `"type": "module"`, so Node loads the snippet\'s `.js` file as CommonJS, where `import` is a syntax error',
          fix: "run this step's command and the snippet again; in a project that stays CommonJS, save the snippet as `index.mjs` and run that",
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
      title: "Add the logger bridge",
      body: { kind: "commands", commands: ["pnpm add @narrativetrace/pino pino"] },
      verify: "pnpm install --frozen-lockfile",
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
      rule: "Check the install with a clean, frozen-lockfile install after adding the packages, rather than trusting whatever is already in node_modules.",
      reason:
        "`pnpm add` installs; the clean install is the check that the lockfile it wrote reproduces — a mismatched peer or stale lockfile is the single most common install failure, and it only surfaces on a clean install",
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
