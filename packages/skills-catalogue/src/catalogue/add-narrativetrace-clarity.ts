// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";
import {
  CLARITY_GATE,
  GATE_SCRIPT_PRESENT,
  READ_RESULTS,
  READ_SETUP,
  REPORTER_REGISTERED,
  RESULTS_FRESH_AND_NONEMPTY,
  RUN_SUITE,
  SOLVED_FIXTURE,
  TEST_CAPTURES_CALLS,
  VITEST_DECLARED,
} from "./clarity-commands.js";
import { DOCTOR_REPORT_WELL_FORMED } from "./doctor-commands.js";

/**
 * Adds or verifies NarrativeTrace Clarity in a Vitest project: a first naming report from the
 * project's own tests, an explanation of it, renames by its suggestions, and a gate only when one
 * is asked for. Tracing itself being broken is `narrativetrace-doctor`'s job; this skill's last
 * step hands off to it.
 *
 * @llmNote Declares the same vocabulary grants as the other non-publishing skills and nothing that
 * files something public, so `publishingNotPreApproved` has nothing to refuse. The gate is the
 * runtime's own shape: the suite reporter writes the results file, the `narrativetrace-clarity` bin
 * gates it. There is no static scan in the published packages, so this skill has no scan path —
 * names are scored where the tests execute them.
 */
export const ADD_NARRATIVETRACE_CLARITY: Skill = {
  canonicalName: "add-narrativetrace-clarity",
  skillClass: "guided",
  description:
    "Adds or verifies NarrativeTrace Clarity in a TypeScript Vitest project. Use when you want a first naming report, per-element explanations, renames for unclear names, or an explicit clarity quality gate. Registers the clarity reporter in the Vitest config, runs the suite, checks the fresh nonempty results file, reads the scores and issues, applies the report's rename suggestions and re-runs until the gate is clean, and preserves existing thresholds. Repairs a missing or empty results file by making a test capture a traced call; route tracing itself being broken to narrativetrace-doctor. Say 'add a clarity report', 'explain our clarity scores', 'set up a clarity quality gate', 'why is the clarity report empty', or 'which names make the trace hard to read' to invoke it.",
  whenToUse:
    "A project has NarrativeTrace and Vitest, and needs a first clarity report, a score explanation, renames, or optional build enforcement.",
  fixture: SOLVED_FIXTURE,
  allowedTools: ["pnpm", "npx", "node", "git"],
  steps: [
    {
      title: "Read the existing test setup before changing it",
      body: { kind: "commands", commands: [READ_SETUP, "git status --short"] },
      verify: VITEST_DECLARED,
      failure: [
        {
          symptom:
            "the verify exits 1: vitest is declared in neither dependencies nor devDependencies",
          cause:
            "the reporter and the results file this skill gates on exist only for Vitest; no other test runner writes them",
          fix: "stop and tell the user: do not migrate their test runner to get a report; the project can still call analyzeClarity on a captured trace by hand",
        },
      ],
    },
    {
      title: "Register the clarity reporter in the Vitest config",
      body: { kind: "snippet", path: `${SOLVED_FIXTURE}/vitest.config.js`, language: "js" },
      verify: REPORTER_REGISTERED,
      failure: [
        {
          symptom: "Vitest fails with: Vitest failed to access its internal state",
          cause:
            "the reporter was imported from the package root, which also loads vitest itself inside a config file that runs before the test runtime exists",
          fix: "import ClaritySuiteReporter from @narrativetrace/vitest/reporters, the subpath that never loads vitest",
        },
        {
          symptom: "the config fails with: Cannot find package '@narrativetrace/vitest'",
          cause: "the packages are not installed in this project",
          fix: "add @narrativetrace/vitest and @narrativetrace/clarity as dev dependencies with the project's own package manager, then re-run",
        },
        {
          symptom: "the project's config already sets reporters",
          cause: "the project chose its own reporters and this skill must not replace them",
          fix: "append new ClaritySuiteReporter() to the existing reporters array, keeping every entry already there",
        },
      ],
    },
    {
      title: "Make sure a test captures a traced call",
      body: {
        kind: "snippet",
        path: `${SOLVED_FIXTURE}/test/order-placer.test.js`,
        language: "js",
      },
      verify: TEST_CAPTURES_CALLS,
      failure: [
        {
          symptom: "the verify exits 1: no test file uses createNarrativeTest",
          cause:
            "the reporter aggregates the scenarios the fixture records; a suite that traces nothing records none, and writes no results file",
          fix: "adapt this example to an existing service: create the test with createNarrativeTest, wrap the service with traceObject on the test's narrativeContext, and make a call",
        },
      ],
    },
    {
      title: "Run the suite so the reporter writes the results",
      body: { kind: "commands", commands: [RUN_SUITE] },
      verify: RESULTS_FRESH_AND_NONEMPTY,
      failure: [
        {
          symptom:
            "the suite passes but narrativetrace-output/clarity-results.json is missing or has no scenarios",
          cause:
            "no test recorded a traced call, or output was turned off, or the reporter writes to another directory",
          fix: "check that a test captures a call (previous step), remove an explicit NARRATIVETRACE_OUTPUT=false, and adapt every path to the reporter's configured output directory",
        },
      ],
    },
    {
      title: "Read the scores and the issues",
      body: { kind: "commands", commands: [READ_RESULTS] },
      verify: RESULTS_FRESH_AND_NONEMPTY,
    },
    {
      title: "Explain the scores, notes and what they do not show",
      body: { kind: "commands", commands: [] },
      flag: "judgmental — base the explanation on the scores and issues just read: a short table of element, observed score and the report's exact suggestion, with your own rename advice labelled separately as a suggestion. overallScore (0-1) weights method names 30%, parameter names 25%, class names 20%, structural quality 15% and cohesion 10%. structuralScore reflects parameter count and call depth. An empty issues array means no scoring rule flagged anything; it does not prove every name is unambiguous",
    },
    {
      title: "Wire the gate into the package scripts, only when asked",
      body: { kind: "snippet", path: `${SOLVED_FIXTURE}/package.json`, language: "json" },
      verify: GATE_SCRIPT_PRESENT,
      failure: [
        {
          symptom: "the gate runs but never fails, whatever the names are",
          cause:
            "--warn-only makes every violation advisory, and a threshold below every observed score cannot fail; neither proves enforcement",
          fix: "write the thresholds the user asked for, keep the ones the project already has, and prove it once: set a threshold above an observed score, confirm the gate fails naming it, restore the policy and re-run",
        },
      ],
    },
    {
      title: "Rename by the report's suggestions, then re-run until the gate is clean",
      body: { kind: "commands", commands: [RUN_SUITE, CLARITY_GATE] },
      verify: CLARITY_GATE,
      failure: [
        {
          symptom: "the gate exits 1 naming a scenario below the minimum score",
          cause:
            "the report's issues name the elements that cost the score; the suite has to be run again for any rename to be measured",
          fix: "rename the flagged element everywhere it is used, including the tests, keep the behaviour unchanged, run the suite and the gate again, and repeat until the gate passes",
        },
        {
          symptom: "the bin exits 1 saying the input file cannot be read",
          cause: "the suite has not run since the output directory was cleaned",
          fix: "run the suite first; the gate reads the results the reporter wrote",
        },
      ],
    },
    {
      title: "Hand missing tracing or output to the doctor",
      body: { kind: "commands", commands: ["npx @narrativetrace/cli doctor || true"] },
      verify: DOCTOR_REPORT_WELL_FORMED,
      failure: [
        {
          symptom: "the results file stays missing after a test captures a call",
          cause: "tracing or output is not wired the way the reporter expects",
          fix: "run narrativetrace-doctor for the diagnosis, apply the identified configuration fix when the user asked for setup or repair, and repeat the run; do not stop at merely naming the doctor",
        },
      ],
    },
  ],
  always: [
    {
      rule: "Start from a fresh suite run and read the results file it wrote.",
      reason:
        "a passing suite can still leave a stale or empty report, so the file's freshness is the only proof the gate had something to gate",
    },
    {
      rule: "Preserve the project's existing reporters, thresholds and output directory.",
      reason:
        "they are the project's own choices; this skill adds a reporter beside them and adapts its paths to the configured output directory",
    },
    {
      rule: "Use the thresholds the user asked for; the numbers in the gate command are an example.",
      reason:
        "a threshold is the project's own policy, and an invented one either blocks work nobody asked to block or passes everything",
    },
    {
      rule: "Measure every rename with another run.",
      reason:
        "a score is observed, never predicted: only the suite run after the rename shows what it did to the gate",
    },
  ],
  never: [
    {
      rule: "Never lower or replace an existing threshold to hide a failure.",
      reason:
        "enforcement is an explicit project choice, and a failing gate is the useful evidence the rename step exists to act on",
    },
    {
      rule: "Never describe a report as enforcement, or promise a score for an untested rename.",
      reason:
        "a report only informs; the gate enforces, and a rename's effect is measured by the next run, not guessed",
    },
    {
      rule: "Never harvest a glossary merely to read existing vocabulary.",
      reason:
        "clarity reads a committed glossary file on its own, and harvesting is a separate opt-in write outside this skill",
    },
    {
      rule: "Never call a missing results file successful.",
      reason: "the gate skips when the file is absent, so a green exit with no file proves nothing",
    },
    {
      rule: "Never import the reporter from the package root in a Vitest config.",
      reason:
        "the root also loads vitest itself, which throws inside a config file on every Vitest version; the reporters subpath does not",
    },
  ],
};
