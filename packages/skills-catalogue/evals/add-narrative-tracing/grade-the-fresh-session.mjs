// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Grades the fresh-session cases: the session AFTER the install must see the skills it left.
 *
 * Shared by two cases. `fresh-session-sees-the-skills` lets the harness run this checkout's
 * installer first and gives the agent ONE fresh turn; `fresh-session-after-the-prompt` keeps the
 * agent's own install in the loop (the published prompt, then a fresh turn, `"freshTurns": [2]`).
 * Either way two things gate, both read from the transcript's LAST turn:
 *
 *   1. the turn's `system/init` event lists every skill the catalogue ships (the objective half: the
 *      skills are LOADED, whatever the agent then does with them);
 *   2. the agent reached for the doctor — the `narrativetrace-doctor` skill by name through the Skill
 *      tool, or the doctor command itself — rather than answering from memory.
 *
 * Why both: item 166 (2026-10-10) was an install that went green and a next session that listed no
 * skill. Gate 1 is that finding, stated as a measurement. Gate 2 is why the skills matter at all: a
 * session that lists them and never uses them on a question written to trigger one is the skill
 * failing to fire — a model reading, not the defect.
 *
 * Run from the scaffolded project copy, with $NARRATIVETRACE_TRANSCRIPT pointing at this trial's
 * evidence, which lives outside this project. The transcript reader is the feedback cases' own — one
 * record format, one reader.
 */
import { existsSync } from "node:fs";
import { read } from "../narrativetrace-feedback/transcript.mjs";
import { EXPECTED_SKILLS } from "./fresh-session-skills.mjs";

const DOCTOR_SKILL = /"skill"\s*:\s*"narrativetrace-doctor"/u;
const DOCTOR_COMMAND = /narrativetrace\s+doctor\b|@narrativetrace\/cli(?:@\S+)?\s+doctor\b/u;

function fail(message) {
  console.error(`grade-the-fresh-session: ${message}`);
  process.exit(1);
}

/** The last turn of the transcript at `$NARRATIVETRACE_TRANSCRIPT`, or a failure saying why not. */
function freshTurn() {
  const path = process.env.NARRATIVETRACE_TRANSCRIPT;
  if (!path || !existsSync(path)) {
    fail("no transcript at $NARRATIVETRACE_TRANSCRIPT — the runner records every trial");
  }
  const turns = read(path);
  if (turns.length === 0) fail("the transcript records no turn at all");
  return turns.at(-1);
}

const fresh = freshTurn();
const missing = EXPECTED_SKILLS.filter((skill) => !fresh.availableSkills.includes(skill));
if (missing.length > 0) {
  const listed = fresh.availableSkills.join(", ") || "nothing";
  fail(
    `the fresh session's init event does not list these skills: ${missing.join(", ")} (it lists: ${listed})`,
  );
}

const usedTheSkill = fresh.commands.some((command) => DOCTOR_SKILL.test(command.text));
const ranTheDoctor = fresh.commands.some((command) => DOCTOR_COMMAND.test(command.text));
if (!usedTheSkill && !ranTheDoctor) {
  fail(
    "the fresh session listed the skills but reached for neither the narrativetrace-doctor skill " +
      "nor the doctor command on a question written to trigger it",
  );
}
console.log(
  `grade-the-fresh-session: the fresh session lists every skill and reached for the doctor (${usedTheSkill ? "skill" : "command"})`,
);
