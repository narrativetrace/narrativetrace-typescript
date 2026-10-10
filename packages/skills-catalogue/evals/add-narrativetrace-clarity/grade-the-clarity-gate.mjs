// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// World-state grader for the clarity skill's happy path. Run with cwd set to the scaffolded
// project; exits 0 only when the gate is wired, scripted and clean. Every refusal prints one line
// `clarity.<reason>: <what is wrong>` to stderr and exits 1, cheapest check first, so a red trial
// names what to read before anything slow has run.
//
// WHAT IS MEASURED (the world, never the agent's words):
//   1. the Vitest config registers `new ClaritySuiteReporter()` imported from the `/reporters`
//      subpath (the package root loads vitest itself and crashes a config file);
//   2. a test still traces a call through `createNarrativeTest` and still asserts a result;
//   3. `package.json` has a `clarity` script running `narrativetrace-clarity` with a minimum score
//      of at least 0.80 (what the prompt asks for) and not `--warn-only` — a weakened gate is not
//      the gate that was asked for;
//   4. `npx vitest run` passes and writes a nonempty `clarity-results.json` in the default output
//      directory (the project's own setting; the reporter is not redirected);
//   5. the project's own script exits 0, and so does the grader's own gate at the asked-for
//      threshold — so the names were renamed, not the gate argued with.
// NOT GRADED HERE: how good the explanation of the scores was (a judged measure, report-only).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIN_SCORE = 0.8;
const RESULTS = join("narrativetrace-output", "clarity-results.json");
const CONFIGS = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"];

function refuse(reason, detail) {
  console.error(`clarity.${reason}: ${detail}`);
  process.exit(1);
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", env: process.env });
}

function readConfig() {
  const file = CONFIGS.find((name) => existsSync(name));
  return file ? readFileSync(file, "utf8") : "";
}

function checkReporter() {
  const config = readConfig();
  if (/import[^;]*ClaritySuiteReporter[^;]*from\s*["']@narrativetrace\/vitest["']/.test(config)) {
    refuse(
      "reporter-from-package-root",
      "ClaritySuiteReporter must come from @narrativetrace/vitest/reporters",
    );
  }
  const registered = /new ClaritySuiteReporter\(/.test(config);
  if (!registered || !config.includes("@narrativetrace/vitest/reporters")) {
    refuse(
      "reporter-not-registered",
      "no Vitest config registers new ClaritySuiteReporter() from /reporters",
    );
  }
  if (/ClaritySuiteReporter\(\s*\{[^)]*outputDir/.test(config)) {
    console.error(
      "note: the reporter is redirected; the results are expected in the default directory",
    );
  }
}

function testFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === "narrativetrace-output") return [];
    return entry.isDirectory() ? testFiles(path) : [path];
  });
}

function checkTestsStillTrace() {
  const traced = testFiles(".").filter(
    (file) =>
      /\.test\.[cm]?[jt]sx?$/.test(file) && /createNarrativeTest/.test(readFileSync(file, "utf8")),
  );
  const asserts = traced.some((file) => /expect\(/.test(readFileSync(file, "utf8")));
  if (traced.length === 0 || !asserts) {
    refuse(
      "no-traced-test",
      "no test file still traces a call with createNarrativeTest and asserts on it",
    );
  }
}

function minScoreOf(script) {
  const match = /--min-score(?:=|\s+)([0-9.]+)/.exec(script);
  return match ? Number(match[1]) : undefined;
}

function checkScript() {
  const script = JSON.parse(readFileSync("package.json", "utf8")).scripts?.clarity ?? "";
  if (!/narrativetrace-clarity/.test(script)) {
    refuse("no-gate-script", 'package.json has no "clarity" script running narrativetrace-clarity');
  }
  const minimum = minScoreOf(script);
  if (/--warn-only/.test(script) || minimum === undefined || minimum < MIN_SCORE) {
    refuse(
      "gate-weakened",
      `the clarity script must require --min-score of at least ${MIN_SCORE} and not be --warn-only: ${script}`,
    );
  }
}

function checkSuiteWritesResults() {
  const suite = run("npx", ["vitest", "run"]);
  if (suite.status !== 0)
    refuse("suite-red", `npx vitest run exited ${suite.status}\n${suite.stdout}${suite.stderr}`);
  const fresh = existsSync(RESULTS) && Date.now() - statSync(RESULTS).mtimeMs < 600000;
  const scenarios = fresh ? (JSON.parse(readFileSync(RESULTS, "utf8")).scenarios ?? []) : [];
  if (scenarios.length === 0)
    refuse("no-results", `${RESULTS} is missing, stale or has no scenarios after the suite ran`);
}

function checkGateIsClean() {
  const own = run("npx", [
    "narrativetrace-clarity",
    "--input",
    RESULTS,
    "--output-dir",
    "narrativetrace-output",
    "--min-score",
    String(MIN_SCORE),
    "--max-high-issues",
    "0",
  ]);
  if (own.status !== 0)
    refuse(
      "gate-failed",
      `the gate at ${MIN_SCORE} exited ${own.status}: ${own.stdout}${own.stderr}`,
    );
  const script = run("npm", ["run", "--silent", "clarity"]);
  if (script.status !== 0)
    refuse(
      "gate-failed",
      `npm run clarity exited ${script.status}: ${script.stdout}${script.stderr}`,
    );
}

checkReporter();
checkTestsStillTrace();
checkScript();
checkSuiteWritesResults();
checkGateIsClean();
console.log("verify.sh: clarity gate: wired, scripted and clean");
