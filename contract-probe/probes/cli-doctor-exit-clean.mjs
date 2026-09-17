// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-cli-doctor-exit-clean: `npx narrativetrace doctor` exits 0 against a clean,
// healthy install (packages/cli/README.md: "Exit codes: 0 clean, 1 findings, 2 could not run").
//
// The claim is about a CLEAN, HEALTHY install, and the first version of this probe never built
// one: it ran `doctor` against the bare scratch project the moment the packages were installed.
// That project has no tests at all, so `trap.redaction-proof` reported — correctly, and about the
// PROJECT rather than the package — that redaction is unproven, and doctor exited 1 as documented.
// The probe read that as "the published CLI does not exit 0", a defect report aimed at the wrong
// thing entirely.
//
// So the fixture is now the healthy project the claim describes, and it is honest: the redaction
// test is really executed and really passes before doctor is asked anything. Explicit parameter
// names keep `trap.parameter-arg0` satisfied by the artifacts the run leaves behind, exactly as
// the troubleshooting guide tells an adopter to do.
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { assertFixtureRan, couldNotProbe, runVitest } from "./probe-support.mjs";

const TEST_FILE = "contract-probe-doctor-redaction.test.ts";
const OUTPUT_DIR = "narrativetrace-output";
rmSync(OUTPUT_DIR, { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { expect } from "vitest";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";
import { renderMarkdown } from "@narrativetrace/core";
const test = createNarrativeTest();
class AuthService { logIn(username, password) { return username; } }
test("contract probe proves redaction", ({ narrativeContext }) => {
  const traced = traceObject(new AuthService(), narrativeContext, { logIn: ["username", "password"] });
  traced.logIn("ada", "hunter2");
  const rendered = renderMarkdown(narrativeContext.captureTrace());
  expect(rendered).toContain("[REDACTED]");
  expect(rendered).toContain("ada");
  expect(rendered).not.toContain("hunter2");
});
`,
);

let observed = "exit-nonzero";
try {
  assertFixtureRan(runVitest([TEST_FILE]), 1, true);
  const doctor = spawnSync("npx", ["narrativetrace", "doctor"], { encoding: "utf-8" });
  const report = `${doctor.stdout ?? ""}${doctor.stderr ?? ""}`;
  // Exit 2 is doctor's own "could not run" — its answer to this claim is then no answer at all.
  if (doctor.status === null || doctor.status === 2) {
    couldNotProbe(`narrativetrace doctor could not run (status ${doctor.status})`, report);
  }
  observed = doctor.status === 0 ? "exit-0" : `exit-nonzero — ${findingLines(report)}`;
} finally {
  rmSync(TEST_FILE, { force: true });
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}

/** The [FAIL] lines only, so a red verdict names which check objected instead of just "nonzero". */
function findingLines(report) {
  const fails = report.split("\n").filter((line) => line.includes("[FAIL]"));
  return fails.length > 0 ? fails.join(" | ") : "no [FAIL] line in the report";
}

console.log(observed);
