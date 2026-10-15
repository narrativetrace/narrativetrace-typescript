// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Grades a narrativetrace-explain trial: the transcript for ORDER, the scratch project for STATE.
 * Port of Java `grade_the_explain.py`, reading the transcript through the verify grader's own
 * reader (`../trace-transcript.mjs`).
 *
 * Run by each case's graders/verify.sh from inside the scratch copy of
 * `fixtures/existing-service-checkout`, with NARRATIVETRACE_TRANSCRIPT pointing at the trial's
 * transcript.
 *
 *   --kind explain  an unfamiliar flow: the skill ran, a trace was produced, and the answer cites a
 *                   span id that trace actually has
 *   --kind control  a pure function: nothing installed, nothing run, nothing traced, and the answer
 *                   comes from the source
 *
 * The fixture's checkout flow is `test/checkout-flow.test.js`'s `customer checks out`, driving
 * `CheckoutService.checkout`: the vendored kit issues the invoice, authorizes the payment, calls
 * every hook — `compose` wires none — and settles through `CardSettlement`, whose `settle` calls
 * `PaymentGateway.confirm`. The kit's own code is minified and not wrapped, so it has no span.
 * `LedgerService` and `NotificationService` are built and never called. That is what an
 * explanation of this flow has to get right, and none of it is visible in a comment.
 *
 * What GATES is mechanical: the skill was invoked, a trace exists, a structural trace reached the
 * agent before its answer, the answer cites an id that trace carries, and the production code and
 * build were left alone. What is REPORTED rather than gated is judgment — whether the calls were
 * named in order, whether the unobserved code was named, whether values were opened.
 *
 * Every check prints one line, PASS or FAIL with its reason; the exit code is 1 when any gating
 * check failed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  filesUnder,
  firstIndex,
  isSkillLoad,
  isTestRun,
  narrativeSeen,
  readEvents,
  SPAN_ID,
  structuralSeen,
  Verdict,
} from "../trace-transcript.mjs";

const SKILL = "narrativetrace-explain";
const FIXTURE = join(import.meta.dirname, "..", "fixtures", "existing-service-checkout");
const OUTPUT = "narrativetrace-output";
const BUILD_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.ts",
];
/** The flow's calls in the order the run makes them — reported, never gated. */
const FLOW_CALLS = [
  "InvoiceService.issueInvoice",
  "PaymentGateway.authorize",
  "PaymentGateway.confirm",
];
const NOT_OBSERVED = /not observ|unobserv|no span|not traced|untraced|not wrapped/i;
const FROM_THE_SOURCE = /reading the source|from the source|pure function|no collaborator/i;

/** The Skill tool naming this skill — what "the skill triggered" means mechanically. */
export function skillInvoked(events) {
  return events.some(
    (e) =>
      e.kind === "tool" &&
      e.payload?.name === "Skill" &&
      JSON.stringify(e.payload.input).includes(SKILL),
  );
}

const sameBytes = (a, b) => (a === null || b === null ? a === b : a.equals(b));

const read = (file) => (existsSync(file) ? readFileSync(file) : null);

/**
 * Every trace the run left in the project, path → text: the `.nt` under structural, the `.mmd`
 * under diagrams and the `.md` narratives. Scoped by extension and directory rather than walking
 * the whole output: the clarity results and a feedback draft are not a trace of a run.
 */
export function traceFiles() {
  const found = new Map();
  for (const file of filesUnder(OUTPUT)) {
    const isTrace =
      (file.endsWith(".nt") && file.includes("/structural/")) ||
      (file.endsWith(".mmd") && file.includes("/diagrams/")) ||
      (file.endsWith(".md") && !file.includes("/structural/") && !file.includes("/feedback/"));
    if (isTrace) found.set(file, readFileSync(file, "utf8"));
  }
  return found;
}

const idsIn = (texts) => new Set([...texts].flatMap((text) => text.match(SPAN_ID) ?? []));

/** The agent's own text in the last turn — the explanation the user reads. */
export function finalAnswer(events) {
  const turns = [...new Set(events.filter((e) => e.kind === "user").map((e) => e.turn))];
  const last = turns.length === 0 ? 0 : Math.max(...turns);
  return events
    .filter((e) => e.kind === "text" && e.turn === last)
    .map((e) => e.payload)
    .join("\n");
}

/** Files under `relative` that differ from the fixture's own, plus any added or removed. */
export function changedUnder(relative) {
  const source = join(FIXTURE, relative);
  const names = (dir) => filesUnder(dir).map((file) => file.slice(dir.length + 1));
  const all = new Set([...names(source), ...names(relative)]);
  return [...all]
    .filter((name) => !sameBytes(read(join(relative, name)), read(join(source, name))))
    .map((name) => join(relative, name))
    .sort();
}

export function changedBuildFiles() {
  return BUILD_FILES.filter((name) => !sameBytes(read(name), read(join(FIXTURE, name))));
}

/** Whether the answer names at least two of the flow's calls, in the order the run made them. */
export function callsNamedInOrder(answer) {
  const seen = FLOW_CALLS.map((call) => [answer.indexOf(call), call]).filter(([at]) => at >= 0);
  return seen.length >= 2 && seen.every(([at], i) => i === 0 || seen[i - 1][0] < at);
}

const lastTextIndex = (events) =>
  events.findLast((e) => e.kind === "text" && e.payload.trim() !== "")?.index ?? null;

function gradeTrace(events, verdict) {
  const traces = traceFiles();
  const structural = [...traces].filter(([path]) => path.endsWith(".nt")).map(([, text]) => text);
  verdict.check(
    structural.length > 0,
    "the run left a structural trace in the project",
    `nothing under ${OUTPUT}/structural — found ${[...traces.keys()]}`,
  );
  const firstNt = firstIndex(events, structuralSeen);
  const answerAt = lastTextIndex(events);
  verdict.check(
    firstNt !== null && answerAt !== null && firstNt < answerAt,
    "a structural trace reached the agent before its answer",
    firstNt === null
      ? "no structural trace line ever reached the agent"
      : `read at ${firstNt}, after the answer at ${answerAt}`,
  );
  const cited = idsIn([finalAnswer(events)]);
  const real = idsIn(structural.length > 0 ? structural : traces.values());
  verdict.check(
    [...cited].some((id) => real.has(id)),
    "the answer cites a span id the trace it produced actually has",
    `ids cited ${[...cited]}, ids in the trace ${[...real]}`,
  );
}

function reportJudgment(events, verdict, answer) {
  verdict.note(`the flow's calls are named in the order they ran: ${callsNamedInOrder(answer)}`);
  verdict.note(`the answer names what was not observed: ${NOT_OBSERVED.test(answer)}`);
  verdict.note(`values were opened: ${firstIndex(events, narrativeSeen) !== null}`);
  verdict.note(`the scenario's own sources changed: ${changedUnder("test")}`);
}

export function gradeExplain(events, verdict) {
  verdict.check(skillInvoked(events), `the Skill tool invoked ${SKILL}`, "it never did");
  verdict.note(
    `the page was read rather than invoked: ${!skillInvoked(events) && firstIndex(events, (e) => isSkillLoad(e, SKILL)) !== null}`,
  );
  gradeTrace(events, verdict);
  verdict.check(
    changedUnder("src").length === 0 && changedBuildFiles().length === 0,
    "the production code and the build were left alone",
    `changed: ${changedUnder("src")} ${changedBuildFiles()}`,
  );
  reportJudgment(events, verdict, finalAnswer(events));
}

/** The first index at which the agent ran the project's tests, or the traced scenario, at all. */
const ranTests = (events) => firstIndex(events, isTestRun);

export function gradeControl(events, verdict) {
  verdict.check(
    changedBuildFiles().length === 0,
    "no dependency was added and no build file changed",
    `changed: ${changedBuildFiles()}`,
  );
  verdict.check(
    changedUnder("src").length === 0 && changedUnder("test").length === 0,
    "the project's sources were left alone",
    `changed: ${changedUnder("src")} ${changedUnder("test")}`,
  );
  const at = ranTests(events);
  verdict.check(at === null, "nothing was run", `the tests ran at event ${at}`);
  const seen = firstIndex(events, (e) => structuralSeen(e) || narrativeSeen(e));
  verdict.check(
    traceFiles().size === 0 && seen === null,
    "nothing was traced",
    `traces on disk ${[...traceFiles().keys()]}, a trace line reached the agent at ${seen}`,
  );
  gradeControlAnswer(events, verdict);
}

function gradeControlAnswer(events, verdict) {
  const answer = finalAnswer(events);
  verdict.check(
    /feeFor|late-fees/.test(answer) && answer.includes("150") && /\b(zero|0)\b/.test(answer),
    "the answer comes from the source: the method, the rate and the not-late case",
    `answer:\n${answer.slice(-800)}`,
  );
  verdict.note(`the skill was invoked: ${skillInvoked(events)}`);
  verdict.note(`the reply says why it is not tracing: ${FROM_THE_SOURCE.test(answer)}`);
}

function main() {
  const kind = process.argv[process.argv.indexOf("--kind") + 1];
  if (kind !== "explain" && kind !== "control") {
    console.error("usage: grade-the-explain.mjs --kind explain|control");
    process.exit(2);
  }
  const events = readEvents(process.env.NARRATIVETRACE_TRANSCRIPT);
  const verdict = new Verdict();
  (kind === "explain" ? gradeExplain : gradeControl)(events, verdict);
  process.exit(verdict.failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
