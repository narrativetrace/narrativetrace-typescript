// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Shared plumbing for the probes that drive a real Vitest run inside the scratch consumer project.
//
// It exists to keep two very different things apart:
//
//   1. "the published package ran and did not do what the docs claim"  -> a real, red verdict
//   2. "the probe never got to ask the question"                       -> could-not-probe
//
// Before this module every vitest-driving probe was shaped `let observed = "<off value>"; try {
// ... } catch {}` with `stdio: "ignore"`, so (2) was silently reported as (1): a harness that
// could not drive the package at all produced a confident defect report about the package. That
// is exactly what release-retrospective-2026-09-07 rule 2 forbids — a check that finds nothing to
// check is RED, never a false verdict.
import { spawnSync } from "node:child_process";
import { writeSync } from "node:fs";

/** Printed in place of a probe's observed value when the probe could not run at all. */
export const COULD_NOT_PROBE = "could-not-probe";

/**
 * How many tests Vitest actually EXECUTED, or `undefined` when its summary line is absent
 * entirely — meaning the run never reached test execution at all (an unresolvable import, no test
 * file collected, a peer missing from the scratch project, `npx` itself failing). `NO_COLOR` is
 * forced by {@link runVitest} so this parse never has to survive ANSI escapes.
 */
function countRanTests(output) {
  const summary = /^\s*Tests\s+(.+)$/m.exec(output);
  if (!summary) return undefined;
  const counts = [...summary[1].matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)];
  return counts.reduce((sum, match) => sum + Number(match[1]), 0);
}

/**
 * Runs one Vitest fixture in the scratch consumer project, capturing BOTH streams.
 *
 * Never throws: a failing test is a legitimate outcome for some probes (approval mode's first run
 * fails by design — nothing is approved yet), so the exit status alone is not the signal. The
 * returned `ran` count is; see {@link countRanTests}.
 */
export function runVitest(args, overrides = {}) {
  const env = { ...process.env, NO_COLOR: "1", ...overrides };
  // An override of `undefined` UNSETS the variable — `delete env.X` in the caller would be undone
  // by the `...process.env` spread above, and Node's spawn rejects an undefined env value.
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
  }
  const result = spawnSync("npx", ["vitest", "run", ...args], { encoding: "utf-8", env });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { status: result.status, output, ran: countRanTests(output) };
}

/**
 * Prints the could-not-probe sentinel and exits cleanly, so `contract-probe/run.ts` reads it as
 * the observed value and `decide()` fails the entry with a message that names the real cause.
 * The entry still goes RED — it is never a pass — but the report no longer blames the package for
 * a harness that could not reach it.
 */
export function couldNotProbe(reason, output = "") {
  const tail = output.trim().split("\n").slice(-12).join(" | ");
  // writeSync, not console.log: stdout is a pipe here (run.ts captures it) and a pipe write is
  // asynchronous, so `process.exit` immediately after a console.log can discard the very line the
  // orchestrator is waiting for — the sentinel would be lost and the entry would report the
  // "<no answer>" it was written to replace.
  writeSync(1, `${COULD_NOT_PROBE}: ${reason}${tail ? ` — ${tail}` : ""}\n`);
  process.exit(0);
}

/**
 * The guard every vitest-driving probe applies to its own run before reading any artifact.
 *
 * @param run          what {@link runVitest} returned.
 * @param expectedTests how many tests the fixture registers; fewer means the fixture is broken.
 * @param expectPass   `true` when the fixture must also PASS for its observation to mean anything.
 *                     Approval mode's probe passes `false`: its first run fails by design.
 */
export function assertFixtureRan(run, expectedTests, expectPass) {
  if (run.ran === undefined) {
    couldNotProbe("Vitest never reached test execution in the scratch project", run.output);
  }
  if (run.ran < expectedTests) {
    couldNotProbe(`the fixture registered ${run.ran} of ${expectedTests} test(s)`, run.output);
  }
  if (expectPass && run.status !== 0) {
    couldNotProbe("the probe fixture itself failed, so it observed nothing", run.output);
  }
}
