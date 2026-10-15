// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SKILLS } from "../../src/index.js";
import { EXPECTED_SKILLS } from "../add-narrative-tracing/fresh-session-skills.mjs";

/**
 * The fresh-session case's grader, rehearsed on a solved trial and the near misses BEFORE any trial
 * is spent. Each row runs the case's real `verify.sh` on a hand-made transcript and asserts the
 * grader's REASON, never only its exit code.
 *
 * Item 166: the install went green and the NEXT session listed no skill. A red that lists no skill
 * is that defect still open; a red that lists them and never reaches for the doctor is a model
 * reading — the two reasons must stay distinguishable.
 */

const VERIFY = join(
  import.meta.dirname,
  "..",
  "add-narrative-tracing",
  "fresh-session-sees-the-skills",
  "graders",
  "verify.sh",
);

const AFTER_THE_PROMPT = VERIFY.replace(
  "fresh-session-sees-the-skills",
  "fresh-session-after-the-prompt",
);

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nt-fresh-grader-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const user = (turn: number) => ({ nt_turn: turn, role: "user", text: `turn ${turn}` });
const init = (skills: readonly string[]) => ({ type: "system", subtype: "init", skills });
const toolUse = (input: object) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", id: "t1", name: "x", input }] },
});

function grade(lines: readonly object[] | undefined, verify = VERIFY) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  if (lines !== undefined) {
    const path = join(root, "transcript.jsonl");
    writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
    env.NARRATIVETRACE_TRANSCRIPT = path;
  }
  const run = spawnSync("sh", [verify], { cwd: root, env, encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

const INSTALL = [user(1), init([])];
const fresh = (skills: readonly string[], ...rest: object[]) => [
  ...INSTALL,
  user(2),
  init(skills),
  ...rest,
];

describe("the fresh-session grader", () => {
  it("expects exactly the catalogue's skills", () => {
    expect([...EXPECTED_SKILLS].sort()).toEqual(SKILLS.map((skill) => skill.canonicalName).sort());
  });

  it("passes a fresh session that lists every skill and calls the doctor skill", () => {
    const run = grade(fresh(EXPECTED_SKILLS, toolUse({ skill: "narrativetrace-doctor" })));
    expect(run.code).toBe(0);
    expect(run.out).toContain("(skill)");
  });

  it("passes a fresh session that runs the doctor command instead", () => {
    const command = toolUse({ command: "npx --yes @narrativetrace/cli doctor --json" });
    const run = grade(fresh(EXPECTED_SKILLS, command));
    expect(run.code).toBe(0);
    expect(run.out).toContain("(command)");
  });

  it("fails — the defect still open — a fresh session that lists no skill", () => {
    const run = grade(fresh([], toolUse({ command: "npx @narrativetrace/cli doctor" })));
    expect(run.code).toBe(1);
    expect(run.out).toContain("does not list these skills");
    expect(run.out).toContain("it lists: nothing");
  });

  it("names the one skill that is missing", () => {
    const listed = EXPECTED_SKILLS.filter((skill) => skill !== "narrativetrace-debug");
    const run = grade(fresh(listed, toolUse({ skill: "narrativetrace-doctor" })));
    expect(run.code).toBe(1);
    expect(run.out).toContain("narrativetrace-debug");
  });

  it("fails — a model reading — a session that lists the skills and never reaches for the doctor", () => {
    const run = grade(fresh(EXPECTED_SKILLS, toolUse({ command: "ls" })));
    expect(run.code).toBe(1);
    expect(run.out).toContain("listed the skills but reached for neither");
  });

  it("does not count a different skill as the doctor", () => {
    const run = grade(fresh(EXPECTED_SKILLS, toolUse({ skill: "narrativetrace-verify" })));
    expect(run.code).toBe(1);
  });

  it("grades the one turn of a delivery case — the harness installed, the agent only asked", () => {
    const run = grade([
      user(1),
      init(EXPECTED_SKILLS),
      toolUse({ skill: "narrativetrace-doctor" }),
    ]);
    expect(run.code).toBe(0);
  });

  it("reads the LAST turn, not the first: skills only an earlier turn listed do not count", () => {
    const run = grade([user(1), init(EXPECTED_SKILLS), user(2), init([])]);
    expect(run.code).toBe(1);
    expect(run.out).toContain("it lists: nothing");
  });

  it("fails a transcript with no turn at all: the session was never opened", () => {
    const run = grade([]);
    expect(run.code).toBe(1);
    expect(run.out).toContain("records no turn");
  });

  it("grades the prompt-path case with the same verdicts", () => {
    const solved = fresh(EXPECTED_SKILLS, toolUse({ skill: "narrativetrace-doctor" }));
    expect(grade(solved, AFTER_THE_PROMPT).code).toBe(0);
    expect(
      grade(fresh([], toolUse({ skill: "narrativetrace-doctor" })), AFTER_THE_PROMPT).code,
    ).toBe(1);
  });

  it("fails without a transcript rather than passing for not looking", () => {
    const run = grade(undefined);
    expect(run.code).toBe(1);
    expect(run.out).toContain("no transcript");
  });
});
