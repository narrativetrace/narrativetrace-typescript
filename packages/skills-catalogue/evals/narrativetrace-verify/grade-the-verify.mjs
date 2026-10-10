// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Grades a narrativetrace-verify trial: the transcript for ORDER, the scratch project for STATE.
 * Port of Java `grade_the_verify.py`.
 *
 * Run by each case's graders/verify.sh from inside the scratch copy of
 * `fixtures/existing-service-checkout`, with NARRATIVETRACE_TRANSCRIPT pointing at the trial's
 * transcript.
 *
 *   --kind interaction  the change fires NotificationService.send; in the final structural trace
 *                       the receipt must follow PaymentGateway.confirm
 *   --kind skip         a pure-function change: the skill must NOT trace it, and must say so
 *
 * Every check prints one line, PASS or FAIL with its reason; the exit code is 1 when any gating
 * check failed. Evidence rules are `../trace-transcript.mjs`'s.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  baselines,
  filesUnder,
  firstIndex,
  follows,
  gradeGate,
  isSkillLoad,
  narrativeSeen,
  prose,
  readEvents,
  runBehind,
  SPAN_ID,
  STRUCTURAL_LINE,
  structuralSeen,
  Verdict,
} from "../trace-transcript.mjs";

const SKILL = "narrativetrace-verify";
const FLOW_NT = "narrativetrace-output/structural/checkout-flow/customer_checks_out.nt";
const INTENT = /\bintent\b/i;

/** Runs the project's suite the way the user would; the trace it writes is the final one. */
export function runSuite(args = []) {
  const done = spawnSync("npx", ["vitest", "run", ...args], { encoding: "utf8", timeout: 600_000 });
  return { green: done.status === 0, output: `${done.stdout}${done.stderr}` };
}

const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

/** Every structural call line of `text`, without its line-number prefix and indent. */
function callLines(text) {
  return new Set(
    text
      .split("\n")
      .filter((line) => STRUCTURAL_LINE.test(line))
      .map((line) => line.replace(/^\s*(?:\d+[\t→])?\s*/, "")),
  );
}

/** What is promoted was shown first: every call line of the pin is in a reply before the yes. */
function shownBefore(events, last, pinned) {
  const replies = events.filter((e) => e.kind === "text" && e.turn < last).map((e) => e.payload);
  const shown = callLines(replies.join("\n"));
  const wanted = callLines(pinned);
  return wanted.size > 0 && [...wanted].every((line) => shown.has(line));
}

function gradeReading(events, verdict) {
  const firstNt = firstIndex(events, structuralSeen);
  const tracedRun = runBehind(events, firstNt);
  const intent = firstIndex(events, (e) => e.kind === "text" && INTENT.test(e.payload));
  verdict.check(
    intent !== null && tracedRun !== null && intent < tracedRun,
    "the intent is written before the first traced run",
    `intent at ${intent}, first traced run at ${tracedRun}`,
  );
  verdict.check(
    intent !== null && firstNt !== null && intent < firstNt,
    "the intent is written before any structural trace is read",
    `intent at ${intent}, first .nt read at ${firstNt}`,
  );
  const values = firstIndex(events, narrativeSeen);
  verdict.check(
    values === null || (firstNt !== null && firstNt <= values),
    "values were not opened before the structural trace",
    `a rendered narrative was read at ${values}, before the first .nt at ${firstNt}`,
  );
  return firstNt;
}

function gradeFinalState(verdict, later, earlier) {
  const { green, output } = runSuite();
  verdict.check(green, "the suite passes in the final state", output.slice(-600));
  const final = read(FLOW_NT);
  verdict.check(
    follows(final, later, earlier),
    `in the final run, ${later} follows ${earlier}`,
    `final structural trace:\n${final}`,
  );
  const files = baselines();
  const received = [...files.keys()].filter((p) => p.endsWith(".received.nt"));
  const pinned = [...files].filter(
    ([p, t]) => p.endsWith(".approved.nt") && follows(t, later, earlier),
  );
  verdict.check(
    pinned.length > 0,
    "a baseline pinning the fixed flow exists",
    `found: ${[...files.keys()]}`,
  );
  verdict.check(received.length === 0, "no .received.nt is left behind", `left: ${received}`);
  return pinned.map(([, text]) => text);
}

/**
 * The report: the agent's own prose after the first structural read — quoted trace lines excluded
 * — citing an id that exists in the pinned baseline. Not only the last turn: the shared gate puts
 * the report BEFORE the pin question (Java cross-port item 4).
 */
function gradeReport(events, verdict, firstNt, pinned) {
  const after = events.filter((e) => e.kind === "text" && firstNt !== null && e.index > firstNt);
  const cited = new Set(after.flatMap((e) => prose(e.payload).match(SPAN_ID) ?? []));
  const real = new Set(pinned.flatMap((text) => text.match(SPAN_ID) ?? []));
  verdict.check(
    [...cited].some((id) => real.has(id)),
    "the report names what the trace showed by span id",
    `ids cited ${[...cited]}, ids in the pinned baseline ${[...real]}`,
  );
}

export function gradeInteraction(events, verdict) {
  const last = gradeGate(events, verdict);
  verdict.note(`${SKILL} loaded: ${firstIndex(events, (e) => isSkillLoad(e, SKILL)) !== null}`);
  const firstNt = gradeReading(events, verdict);
  verdict.check(
    firstNt !== null,
    "a structural trace was read",
    "no structural call line reached the agent",
  );
  const pinned = gradeFinalState(verdict, "NotificationService.send", "PaymentGateway.confirm");
  verdict.note(
    `what was promoted was shown whole before the yes: ${pinned.length > 0 && shownBefore(events, last, pinned[0])}`,
  );
  gradeReport(events, verdict, firstNt, pinned);
}

/** Adds one assertion of the cap to the scratch copy and runs only that test. */
function capHolds() {
  const probe = "test/late-fee-cap-grader-probe.test.js";
  writeFileSync(
    probe,
    'import { expect, test } from "vitest";\nimport { feeFor } from "../src/late-fees.js";\n' +
      'test("capped", () => {\n  expect(feeFor(1000)).toBe(2000);\n  expect(feeFor(3)).toBe(450);\n});\n',
  );
  const { green } = runSuite([probe]);
  rmSync(probe, { force: true });
  return green;
}

/** Whether any project file turns approval mode on (the fixture option or the environment switch). */
function approvalSwitchedOn() {
  return filesUnder(".")
    .filter(
      (file) => /\.(js|ts|mjs|cjs|json)$/.test(file) && !file.includes("narrativetrace-output"),
    )
    .some((file) => /approval\s*:\s*true|NARRATIVETRACE_APPROVAL/.test(readFileSync(file, "utf8")));
}

export function gradeSkip(events, verdict) {
  const { green, output } = runSuite();
  verdict.check(green, "the suite passes in the final state", output.slice(-600));
  verdict.check(capHolds(), "the late fee is capped at 2000 cents", "feeFor(1000) is not 2000");
  const seen = firstIndex(events, structuralSeen);
  verdict.check(
    seen === null,
    "no structural trace was read for a pure-function change",
    `read at event ${seen}`,
  );
  verdict.check(
    baselines().size === 0,
    "no approval baseline was written",
    `found ${[...baselines().keys()]}`,
  );
  verdict.check(
    !approvalSwitchedOn(),
    "approval mode was not switched on",
    "a project file turns it on",
  );
  const said = events
    .filter((e) => e.kind === "text")
    .map((e) => e.payload)
    .join("\n");
  const skipped =
    /skip/i.test(said) &&
    /pure function|no collaborator|one[- ]class|single (class|function)/i.test(said);
  verdict.check(
    skipped,
    "the transcript says the skill was skipped and why",
    "no skip with a reason",
  );
  verdict.note(`${SKILL} loaded: ${firstIndex(events, (e) => isSkillLoad(e, SKILL)) !== null}`);
}

function main() {
  const kind = process.argv[process.argv.indexOf("--kind") + 1];
  if (kind !== "interaction" && kind !== "skip") {
    console.error("usage: grade-the-verify.mjs --kind interaction|skip");
    process.exit(2);
  }
  const events = readEvents(process.env.NARRATIVETRACE_TRANSCRIPT);
  const verdict = new Verdict();
  (kind === "skip" ? gradeSkip : gradeInteraction)(events, verdict);
  process.exit(verdict.failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
