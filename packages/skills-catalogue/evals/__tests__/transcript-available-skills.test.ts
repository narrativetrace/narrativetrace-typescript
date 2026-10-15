// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as transcript from "../narrativetrace-feedback/transcript.mjs";

/**
 * What the agent of ONE turn could see: the `system/init` event lists the skills loaded for the
 * session, so a fresh-session turn's list answers "does the next session find the skills the install
 * left?" — the question an install case's end state cannot answer (item 166).
 */

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-transcript-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const user = (turn: number) => ({ nt_turn: turn, role: "user", text: `turn ${turn}` });
const init = (skills: unknown) => ({ type: "system", subtype: "init", skills });

function turnsOf(...lines: object[]) {
  const path = join(dir, "transcript.jsonl");
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return transcript.read(path);
}

describe("a turn's available skills", () => {
  it("is what the init event of THAT turn listed", () => {
    const turns = turnsOf(
      user(1),
      init(["a", "b"]),
      user(2),
      init(["a", "b", "narrativetrace-doctor"]),
    );
    expect(turns.map((turn: { availableSkills: string[] }) => turn.availableSkills)).toEqual([
      ["a", "b"],
      ["a", "b", "narrativetrace-doctor"],
    ]);
  });

  it("is empty for a turn whose session started with no skill", () => {
    expect(turnsOf(user(1), init([]))[0].availableSkills).toEqual([]);
  });

  it("is empty when the turn has no init event at all", () => {
    expect(turnsOf(user(1))[0].availableSkills).toEqual([]);
  });

  it("is empty when the init event's skills are not a list", () => {
    expect(turnsOf(user(1), init("a,b"))[0].availableSkills).toEqual([]);
  });

  it("reads names as text, whatever they arrived as", () => {
    expect(turnsOf(user(1), init(["a", 7]))[0].availableSkills).toEqual(["a", "7"]);
  });

  it("keeps an init event out of what the agent said", () => {
    expect(transcript.said(turnsOf(user(1), init(["a"]))[0])).toBe("");
  });
});
