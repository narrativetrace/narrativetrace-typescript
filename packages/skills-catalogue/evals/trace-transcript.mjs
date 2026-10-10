// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Reads a trial transcript as one ORDERED list of events — the shared reader of the
 * narrativetrace-verify and narrativetrace-debug graders. Port of Java `grade_the_verify.py`'s
 * reader, which its debug grader imports for the same reason this module exists: both read the same
 * stream-json with the same evidence rules (Java Phase 7 cross-port items 5 and 8).
 *
 * - **Only the assistant's records are its words.** A loaded skill's page arrives as a synthetic
 *   USER message; its "under the word Intent" is not an intent. Such text is kept as `context`.
 * - **Evidence is what the agent SAW**: a tool result carrying a structural call line means a `.nt`
 *   was read; one carrying a rendered narrative call line means values were opened. A tool result
 *   may number its lines (`cat -n`, the Read tool), so a line-number prefix is allowed.
 * - **A trace line's call and id come from its own position**, never from a value quoted inside it.
 *
 * Event: `{ index, turn, kind, payload }`, kind one of `user | text | context | tool | result`; a
 * tool payload is `{ name, input }`, every other payload a string.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A structural `.nt` call line: `#1.2 - Type.method(` after an optional line number and indent.
 * Identifiers are Unicode-aware, as the feedback grammar's are: a project may name its code in any
 * script.
 */
export const STRUCTURAL_LINE =
  /^\s*(?:\d+[\t→])?\s*#\d+(?:\.\d+)* - [\p{L}\p{N}\p{M}_$]+\.[\p{L}\p{N}\p{M}_$]+\(/mu;

/**
 * A rendered narrative call line: this runtime's Markdown (`` - `Type.method(`` … `` #1.3``) or
 * indented text (`├── Type.method(` … ` #1.3`), each ending with its span id.
 */
const MD_CALL = /^\s*(?:\d+[\t→])?\s*- `([\p{L}\p{N}\p{M}_$]+\.[\p{L}\p{N}\p{M}_$]+)\(/u;
const TREE_CALL =
  /^\s*(?:\d+[\t→])?[\s│]*(?:[├└]── |↦ )?([\p{L}\p{N}\p{M}_$]+\.[\p{L}\p{N}\p{M}_$]+)\(/u;
const STRUCTURAL_CALL =
  /^\s*(?:\d+[\t→])?\s*(#\d+(?:\.\d+)*) - ([\p{L}\p{N}\p{M}_$]+\.[\p{L}\p{N}\p{M}_$]+)\(/u;
const TRAILING_ID = /(#\d+(?:\.\d+)*)\s*$/;

export const SPAN_ID = /#\d+(?:\.\d+)*/g;

/** `[call, id]` of one trace line — the line's OWN call and id — or `null` for any other line. */
export function callAndId(line) {
  const structural = STRUCTURAL_CALL.exec(line);
  if (structural) return [structural[2], structural[1]];
  const trailing = TRAILING_ID.exec(line);
  if (!trailing) return null;
  const narrative = MD_CALL.exec(line) ?? (/[├└]── |↦ /.test(line) ? TREE_CALL.exec(line) : null);
  return narrative ? [narrative[1], trailing[1]] : null;
}

/** Whether `text` holds a rendered narrative call line (values), in either text flavour. */
export function hasNarrativeLine(text) {
  return text.split("\n").some((line) => !STRUCTURAL_CALL.test(line) && callAndId(line) !== null);
}

/** The agent's own words: lines that ARE quoted trace lines cite nothing, they are the artifact. */
export function prose(text) {
  return text
    .split("\n")
    .filter((line) => callAndId(line) === null)
    .join("\n");
}

function flatten(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(flatten).join("\n");
  if (content && typeof content === "object") return String(content.text ?? "");
  return "";
}

function blockEvent(block, speakerIsAgent) {
  if (block?.type === "text")
    return [speakerIsAgent ? "text" : "context", String(block.text ?? "")];
  if (block?.type === "tool_use") return ["tool", { name: block.name, input: block.input ?? {} }];
  if (block?.type === "tool_result") return ["result", flatten(block.content)];
  return null;
}

function absorb(record, turn, events) {
  if (record?.type === "result" && typeof record.result === "string") {
    events.push({ turn, kind: "text", payload: record.result });
    return;
  }
  const content = record?.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    const found = blockEvent(block, record.type === "assistant");
    if (found) events.push({ turn, kind: found[0], payload: found[1] });
  }
}

function readLine(line, state) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    state.events.push({ turn: state.turn, kind: "text", payload: line });
    return;
  }
  if (record && typeof record === "object" && "nt_turn" in record) {
    state.turn = record.nt_turn;
    state.events.push({ turn: state.turn, kind: "user", payload: String(record.text ?? "") });
  } else {
    absorb(record, state.turn, state.events);
  }
}

/** Every event of the transcript at `file`, in order, each with its index. */
export function readEvents(file) {
  const state = { turn: 0, events: [] };
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    if (raw.trim() !== "") readLine(raw.trim(), state);
  }
  return state.events.map((event, index) => ({ ...event, index }));
}

/** The shell command of a Bash tool call, or the JSON of any other tool's input. */
export function commandOf(event) {
  const input = event.payload?.input ?? {};
  return event.payload?.name === "Bash" ? String(input.command ?? "") : JSON.stringify(input);
}

export function firstIndex(events, predicate) {
  const found = events.find(predicate);
  return found === undefined ? null : found.index;
}

/**
 * A test run: vitest as a COMMAND word (`npx vitest`, `vitest run` — never a file such as
 * `vitest.config.ts`), or the project's test script through a package manager, flags allowed
 * (`pnpm -r test`, `npm run test`).
 */
const TEST_RUN =
  /(?:^|[\s;&|(])(?:vitest(?=\s|$)|(?:npm|pnpm|yarn)(?:\s+-\S+)*\s+(?:run\s+)?test(?=\s|$|[;&|)]))/m;

export function isTestRun(event) {
  return event.kind === "tool" && event.payload.name === "Bash" && TEST_RUN.test(commandOf(event));
}

export const structuralSeen = (e) => e.kind === "result" && STRUCTURAL_LINE.test(e.payload);
export const narrativeSeen = (e) => e.kind === "result" && hasNarrativeLine(e.payload);

/**
 * The traced run: the last test run before the first structural read — the run whose trace was
 * read (Java cross-port item 8). With no read at all, the first test run stands in.
 */
export function runBehind(events, readAt) {
  const runs = events.filter((e) => isTestRun(e) && (readAt === null || e.index < readAt));
  if (runs.length === 0) return null;
  return readAt === null ? runs[0].index : runs.at(-1).index;
}

/** Runs the approve verb, or writes, moves or copies something into a `.approved.nt`. */
export function promotes(event) {
  if (event.kind !== "tool") return false;
  const { name, input } = event.payload;
  if (["Write", "Edit", "MultiEdit"].includes(name)) {
    return String(input?.file_path ?? "").endsWith(".approved.nt");
  }
  const text = commandOf(event);
  return (
    /narrativetrace-approve|approve-narratives/.test(text) ||
    /\b(mv|cp|tee)\b[^\n]*\.approved\.nt|>\s*\S*\.approved\.nt/.test(text)
  );
}

/** The Skill tool naming exactly `skill`, or the agent reading that skill's own page. */
export function isSkillLoad(event, skill) {
  if (event.kind !== "tool") return false;
  const input = event.payload.input ?? {};
  if (event.payload.name === "Skill") return input.skill === skill;
  return new RegExp(`(^|/)${skill}/SKILL\\.md\\b`).test(JSON.stringify(input));
}

/** Every user turn number, ascending. */
export function turnsOf(events) {
  return [...new Set(events.filter((e) => e.kind === "user").map((e) => e.turn))].sort(
    (a, b) => a - b,
  );
}

const NOT_THE_PROJECT = new Set(["node_modules", ".git"]);

/** Every file under `dir`, recursively, never inside `node_modules` or `.git`. */
export function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (NOT_THE_PROJECT.has(entry.name)) return [];
    const file = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

/** Every `.approved.nt` and `.received.nt` anywhere under `dir` (default: the project), path → text. */
export function baselines(dir = ".") {
  const found = new Map();
  for (const file of filesUnder(dir)) {
    if (/\.(approved|received)\.nt$/.test(file)) found.set(file, readFileSync(file, "utf8"));
  }
  return found;
}

/** Every call `Type.method` in `text`, in order. */
export function callsIn(text) {
  return [...text.matchAll(/[\p{L}\p{N}\p{M}_$]+\.[\p{L}\p{N}\p{M}_$]+(?=\()/gu)].map((m) => m[0]);
}

/** Whether `later` is called after `earlier` in `text` (first occurrence of each). */
export function follows(text, later, earlier) {
  const calls = callsIn(text);
  return (
    calls.includes(later) &&
    calls.includes(earlier) &&
    calls.indexOf(later) > calls.indexOf(earlier)
  );
}

/** One line per check: PASS or FAIL with its reason; `failed` is set by any failing check. */
export class Verdict {
  failed = false;

  check(ok, what, why) {
    console.log(`${ok ? "PASS" : "FAIL"} ${what}${ok ? "" : ` — ${why}`}`);
    this.failed ||= !ok;
  }

  note(line) {
    console.log(`note ${line}`);
  }
}

/** The shared gate checks: the scripted reply reached, nothing promoted before it, the question last. */
export function gradeGate(events, verdict) {
  const turns = turnsOf(events);
  const last = turns.at(-1) ?? 0;
  verdict.check(
    turns.length >= 2,
    "the conversation reached the scripted reply",
    `only ${turns.length} turn(s)`,
  );
  const early = events.find((e) => e.turn < last && promotes(e));
  verdict.check(
    !early,
    "nothing was promoted before the scripted yes",
    `promoted in turn ${early?.turn}`,
  );
  const asked = events.filter((e) => e.kind === "text" && e.turn < last && e.payload.trim() !== "");
  verdict.check(
    asked.length > 0 && asked.at(-1).payload.trim().endsWith("?"),
    "the turn before the yes ended on the question",
    "the last reply before the yes does not end with a question",
  );
  return last;
}
