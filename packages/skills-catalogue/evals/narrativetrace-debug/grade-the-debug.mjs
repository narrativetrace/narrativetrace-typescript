// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Grades a narrativetrace-debug trial: the transcript for ORDER, the scratch project for STATE.
 * Port of Java `grade_the_debug.py`, reading the transcript through the verify grader's own reader
 * (`../trace-transcript.mjs`).
 *
 * The fixture's defect is a rounding in `RateTableConverter.convert` — it rounds to whole francs
 * before moving to cents — so 45.99 EUR at 0.93 is charged CHF 43.00, not 42.77. It is visible only
 * as a value: `RateTableConverter.convert(amountCents: 4599, from: "EUR", to: "CHF") → 4300 #1.3`,
 * with its child `DailyRates.rateFor` returning the right 0.93. The structural trace is the same
 * before and after the fix.
 *
 * Every check prints one line, PASS or FAIL with its reason; exit 1 when any gating check failed.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, relative } from "node:path";
import {
  baselines,
  callAndId,
  commandOf,
  filesUnder,
  firstIndex,
  gradeGate,
  isSkillLoad,
  narrativeSeen,
  prose,
  readEvents,
  SPAN_ID,
  Verdict,
} from "../trace-transcript.mjs";

const SKILL = "narrativetrace-debug";
export const DIVERGING_CALL = "RateTableConverter.convert";
const CONVERTER = "src/rate-table-converter.js";
const FIXTURE = join(import.meta.dirname, "..", "fixtures", "existing-service-checkout-currency");
const OUTPUT = "narrativetrace-output";

/** The ids the agent was SHOWN for the diverging call: each trace line's own id, never a value's. */
export function divergingIds(events) {
  const ids = new Set();
  for (const event of events) {
    if (event.kind !== "result") continue;
    for (const line of event.payload.split("\n")) {
      const found = callAndId(line);
      if (found && found[0] === DIVERGING_CALL) ids.add(found[1]);
    }
  }
  return ids;
}

/**
 * A path under `src/` once resolved against the shell's working directory (`cwd`, relative to the
 * project) — so `cd src && cp x ../test/` writes `test/`, not `src/`.
 */
export function inSource(target, cwd = ".") {
  if (!target || target.startsWith("-") || target.startsWith("&") || target === "/dev/null")
    return false;
  const bare = target.replace(/^['"]|['"]$/g, "");
  const path = bare.startsWith("/") ? normalize(bare) : normalize(join(cwd, bare));
  return /(^|\/)src(\/|$)/.test(path);
}

function tokens(segment) {
  return segment.match(/'[^']*'|"[^"]*"|\S+/g)?.map((w) => w.replace(/^['"]|['"]$/g, "")) ?? [];
}

/** The words of a command with its redirections set aside — REDIRECT already judged their targets. */
function withoutRedirections(words) {
  const kept = [];
  for (let i = 0; i < words.length; i++) {
    if (/^\d*(>>?|<)(&\d+)?$/.test(words[i])) {
      if (!/&\d$/.test(words[i])) i++;
    } else if (!/^\d*(>>?|<)/.test(words[i])) kept.push(words[i]);
  }
  return kept;
}

const REDIRECT = /(?<![<&])\d?>>?\s*([^\s|;&]+)/g;
const IN_PLACE = /^(-[a-zA-Z]*i[\w.]*|--in-place\S*)$/;

function commandWrites(command, args, cwd) {
  const operands = args.filter((a) => !a.startsWith("-"));
  const anyIn = (list) => list.some((f) => inSource(f, cwd));
  if ((command === "sed" || command === "perl") && args.some((a) => IN_PLACE.test(a))) {
    const scripted = args.includes("-e") || args.includes("-f");
    return anyIn(scripted ? operands : operands.slice(1));
  }
  if (command === "tee" || command === "rm" || command === "unlink") return anyIn(operands);
  if (["cp", "mv", "install"].includes(command))
    return operands.length > 0 && inSource(operands.at(-1), cwd);
  if (command === "git" && ["checkout", "restore"].includes(operands[0]))
    return anyIn(operands.slice(1));
  return false;
}

/** One simple command writes `src/`: a redirect into it, or a writing command whose target is in it. */
function segmentWrites(segment, cwd) {
  for (const match of segment.matchAll(REDIRECT)) if (inSource(match[1], cwd)) return true;
  let words = tokens(segment);
  while (words.length > 0 && (words[0] === "sudo" || /^\w+=/.test(words[0])))
    words = words.slice(1);
  words = withoutRedirections(words);
  if (words.length === 0) return false;
  const command = words[0].split("/").at(-1);
  if (command === "node" && /writeFileSync\([^)]*src\//.test(segment)) return true;
  return commandWrites(command, words.slice(1), cwd);
}

/** Walks a shell command's simple commands in order, tracking the working directory `cd` sets. */
export function shellWritesSource(command) {
  let cwd = ".";
  for (const line of command.split("\n")) {
    for (const segment of line.split(/\s*(?:&&|\|\||[|;])\s*/)) {
      const words = tokens(segment);
      if (words[0] === "cd") {
        const to = words[1] ?? "/";
        cwd = to.startsWith("/") ? to : normalize(join(cwd, to));
      } else if (segmentWrites(segment, cwd)) return true;
    }
  }
  return false;
}

/**
 * A tool call that changes production source: an edit or write under `src/`, or a shell command
 * whose write TARGET is under `src/`. A command that only names `src/` — a grep, `cat src/x.js
 * 2>/dev/null` — is a read.
 */
export function editsSource(event) {
  if (event.kind !== "tool") return false;
  const { name, input } = event.payload;
  if (["Edit", "Write", "MultiEdit"].includes(name)) {
    const file = String(input?.file_path ?? "");
    return inSource(file.startsWith("/") ? relative(process.cwd(), file) : file);
  }
  return name === "Bash" && shellWritesSource(commandOf(event));
}

function gradeNamedBeforeFix(events, verdict) {
  const fixAt = firstIndex(events, editsSource);
  const seenFirst = divergingIds(fixAt === null ? events : events.slice(0, fixAt));
  const valuesAt = firstIndex(events, narrativeSeen);
  verdict.check(
    valuesAt !== null && (fixAt === null || valuesAt < fixAt),
    "the values of the reproduction were read before the fix",
    valuesAt === null
      ? "no rendered narrative reached the agent"
      : `read at ${valuesAt}, fix at ${fixAt}`,
  );
  const cites = (e) =>
    e.kind === "text" && (prose(e.payload).match(SPAN_ID) ?? []).some((id) => seenFirst.has(id));
  const namedAt = firstIndex(events, cites);
  verdict.check(
    seenFirst.size > 0 && namedAt !== null && fixAt !== null && namedAt < fixAt,
    "the diverging span is named by its id before the fix",
    `ids shown for ${DIVERGING_CALL} before the fix: ${[...seenFirst]}; named at ${namedAt}; first src/ write at ${fixAt}`,
  );
  return fixAt;
}

/** The root cause in the agent's prose after the fix, quoted trace lines excluded (item 4). */
function gradeReport(events, verdict, fixAt, last) {
  const ids = divergingIds(events);
  const after = events.filter((e) => e.kind === "text" && fixAt !== null && e.index > fixAt);
  const cited = new Set(after.flatMap((e) => prose(e.payload).match(SPAN_ID) ?? []));
  verdict.check(
    [...cited].some((id) => ids.has(id)),
    "the root-cause report after the fix names the diverging span by its id",
    `ids cited after the fix ${[...cited]}, ids of ${DIVERGING_CALL} ${[...ids]}`,
  );
  const closing = events
    .filter((e) => e.kind === "text" && e.turn === last)
    .map((e) => prose(e.payload));
  verdict.note(
    `the closing reply names the diverging span again: ${(closing.join("\n").match(SPAN_ID) ?? []).some((id) => ids.has(id))}`,
  );
}

export function gradeOrder(events, verdict) {
  const last = gradeGate(events, verdict);
  verdict.note(`${SKILL} loaded: ${firstIndex(events, (e) => isSkillLoad(e, SKILL)) !== null}`);
  const fixAt = gradeNamedBeforeFix(events, verdict);
  gradeReport(events, verdict, fixAt, last);
}

function vitest(dir, args = []) {
  const done = spawnSync("npx", ["vitest", "run", ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 600_000,
  });
  return { green: done.status === 0, output: `${done.stdout}${done.stderr}` };
}

/** The value AT the diverging span in the final code: today's converter, the ticket's input. */
function converterValueIsRight() {
  const probe = "test/converter-grader-probe.test.js";
  writeFileSync(
    probe,
    'import { expect, test } from "vitest";\nimport { DailyRates } from "../src/daily-rates.js";\n' +
      'import { RateTableConverter } from "../src/rate-table-converter.js";\n' +
      'test("ticket", () => {\n  const converter = new RateTableConverter(new DailyRates());\n' +
      '  expect(converter.convert(4599, "EUR", "CHF")).toBe(4277);\n' +
      '  expect(converter.convert(10000, "EUR", "CHF")).toBe(9300);\n' +
      '  expect(converter.convert(4500, "EUR", "EUR")).toBe(4500);\n});\n',
  );
  const { green } = vitest(".", [probe]);
  rmSync(probe, { force: true });
  return green;
}

/**
 * The parameter names of a rendered argument list — `name: value, name: value` — read at nesting
 * depth zero and outside quotes, so a value that itself reads `x: 1` adds no name.
 */
export function parameterNames(args) {
  const names = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i <= args.length; i++) {
    const c = args[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c !== undefined && "([{".includes(c)) depth++;
    else if (c !== undefined && ")]}".includes(c)) depth--;
    else if ((c === "," || c === undefined) && depth === 0) {
      const name = /^\s*([\p{L}\p{N}\p{M}_$]+): /u.exec(args.slice(start, i));
      if (name) names.push(name[1]);
      start = i + 1;
    }
  }
  return names;
}

/** `#id Type.method(names)` of a Markdown narrative call line, or `null` for any other line. */
export function shapeOf(line) {
  const found = callAndId(line);
  const call = /- `[\p{L}\p{N}\p{M}_$]+\.[\p{L}\p{N}\p{M}_$]+\((.*)\)`/u.exec(line);
  if (!found || !call) return null;
  return `${found[1]} ${found[0]}(${parameterNames(call[1]).join(", ")})`;
}

/** Each scenario's call shape from its `.md` — written on a red run too, where no `.nt` is (item 3). */
export function shapes(root) {
  const found = new Map();
  for (const file of filesUnder(join(root, OUTPUT))) {
    const rel = relative(join(root, OUTPUT), file);
    if (!file.endsWith(".md") || /^(structural|diagrams|feedback)\//.test(rel)) continue;
    found.set(rel, readFileSync(file, "utf8").split("\n").map(shapeOf).filter(Boolean));
  }
  return found;
}

/** The final project with every fixture production file put back; the agent's tests stay. */
function preFixCopy() {
  const copy = mkdtempSync(join(tmpdir(), "debug-grader-prefix-"));
  const kept = (src) =>
    !/(^|\/)(node_modules|narrativetrace-output)(\/|$)/.test(relative(".", src));
  cpSync(".", copy, { recursive: true, filter: kept });
  symlinkSync(join(process.cwd(), "node_modules"), join(copy, "node_modules"));
  cpSync(join(FIXTURE, "src"), join(copy, "src"), { recursive: true });
  return copy;
}

function gradeDelta(verdict, before, after) {
  const common = [...before.keys()].filter((s) => after.has(s)).sort();
  const reaching = common.filter((s) =>
    before.get(s).some((line) => line.includes(`${DIVERGING_CALL}(`)),
  );
  const moved = common
    .filter((s) => JSON.stringify(before.get(s)) !== JSON.stringify(after.get(s)))
    .map((s) => `${s}:\n  before ${before.get(s)}\n  after  ${after.get(s)}`);
  verdict.check(
    reaching.length > 0 && moved.length === 0,
    "the structural delta against the pre-fix run shows nothing else moved",
    reaching.length === 0 ? `no scenario reached ${DIVERGING_CALL} in both runs` : moved.join("\n"),
  );
}

function gradeBaseline(verdict) {
  const files = baselines();
  const received = [...files.keys()].filter((p) => p.endsWith(".received.nt"));
  const pinned = [...files].filter(
    ([p, t]) => p.endsWith(".approved.nt") && t.includes(`${DIVERGING_CALL}(`),
  );
  verdict.check(
    pinned.length > 0,
    "a baseline pinning the reproduced flow exists",
    `found: ${[...files.keys()]}`,
  );
  verdict.check(received.length === 0, "no .received.nt is left behind", `left: ${received}`);
}

export function gradeState(verdict) {
  const { green, output } = vitest(".");
  verdict.check(green, "the suite passes in the final state", output.slice(-600));
  const changed =
    existsSync(CONVERTER) &&
    readFileSync(CONVERTER, "utf8") !== readFileSync(join(FIXTURE, CONVERTER), "utf8");
  verdict.check(
    changed,
    "the fix touches the diverging span's code",
    `${CONVERTER} is as the fixture shipped it`,
  );
  verdict.check(
    converterValueIsRight(),
    "the diverging span now carries the right value (4599 EUR at 0.93 is 4277)",
    "RateTableConverter still converts the ticket's input wrongly — the symptom was silenced elsewhere",
  );
  const after = shapes(".");
  const copy = preFixCopy();
  try {
    const reverted = vitest(copy);
    verdict.check(
      !reverted.green,
      "a regression test fails when the fix is undone",
      "with the fixture's production code back, every test still passes",
    );
    gradeDelta(verdict, shapes(copy), after);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
  gradeBaseline(verdict);
}

function main() {
  const events = readEvents(process.env.NARRATIVETRACE_TRANSCRIPT);
  const verdict = new Verdict();
  gradeOrder(events, verdict);
  gradeState(verdict);
  process.exit(verdict.failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
