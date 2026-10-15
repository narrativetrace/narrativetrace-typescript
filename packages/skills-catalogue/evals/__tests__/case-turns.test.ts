// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { freshTurnsFrom, scriptedReplies } from "../case-turns.js";

/**
 * The scripted user replies a case declares in its own `case.json`, keyed BY TURN NUMBER. Every
 * malformed declaration throws rather than shortening the conversation: a case whose second turn
 * silently did not happen passes its approval grader for the worst reason — nothing was filed
 * because nothing was asked.
 */

const MANIFEST = "/evals/narrativetrace-feedback/approval-gate-refused/case.json";

describe("scriptedReplies", () => {
  it("is empty for a case that declares no turns — one turn, its prompt.md", () => {
    expect(scriptedReplies(MANIFEST, undefined)).toEqual([]);
  });

  it("reads one reply at turn 2", () => {
    expect(scriptedReplies(MANIFEST, { "2": "yes, file it" })).toEqual(["yes, file it"]);
  });

  it("orders replies by turn number, never by the order they were written in", () => {
    expect(scriptedReplies(MANIFEST, { "3": "third", "2": "second" })).toEqual(["second", "third"]);
  });

  it("orders turns numerically past nine, where a string sort would put 10 before 2", () => {
    const turns: Record<string, string> = {};
    for (let turn = 2; turn <= 11; turn++) turns[String(turn)] = `reply ${turn}`;
    expect(scriptedReplies(MANIFEST, turns).at(-1)).toBe("reply 11");
  });

  it("keeps a reply's own quotes and line breaks — it is text somebody typed", () => {
    expect(scriptedReplies(MANIFEST, { "2": 'no — "not yet"\nmaybe later' })).toEqual([
      'no — "not yet"\nmaybe later',
    ]);
  });

  it.each([
    ["an array", ["yes"], /object keyed by turn number/],
    ["a string", "yes", /object keyed by turn number/],
    ["null", null, /object keyed by turn number/],
    ["an empty object", {}, /lists no reply/],
    ["a key that is not a turn number", { two: "yes" }, /"two", which is not a turn number/],
    ["a fractional turn", { "2.5": "yes" }, /"2.5", which is not a turn number/],
    ["a padded turn", { " 2": "yes" }, /" 2", which is not a turn number/],
    ["a zero-padded alias of turn 2", { "2": "a", "02": "b" }, /"02", which is not a turn number/],
    ["turn 1, which is prompt.md", { "1": "yes" }, /turn 1 is the case's own prompt.md/],
    ["turn 0", { "0": "yes" }, /turn 1 is the case's own prompt.md/],
    ["a gap before turn 3", { "3": "yes" }, /no reply for turn 2, so turn 3 could never/],
    ["a gap in the middle", { "2": "a", "4": "b" }, /no reply for turn 3, so turn 4/],
    ["a blank reply", { "2": "  " }, /blank reply/],
    ["a reply that is not text", { "2": true }, /blank reply/],
  ])("refuses %s, naming the manifest", (_label, turns, reason) => {
    expect(() => scriptedReplies(MANIFEST, turns)).toThrow(reason);
    expect(() => scriptedReplies(MANIFEST, turns)).toThrow(MANIFEST);
  });
});

/**
 * A fresh turn is a scripted turn that opens a NEW session instead of resuming the one before it —
 * the only way to measure what a LATER session finds, which is what "does the agent see the skills
 * the install left?" asks (item 166: the install went green and the next session listed no skill).
 */
describe("freshTurnsFrom", () => {
  it("is empty for a case that declares none — every turn resumes", () => {
    expect(freshTurnsFrom(MANIFEST, undefined, 1)).toEqual([]);
  });

  it("reads the scripted turn that opens a fresh session", () => {
    expect(freshTurnsFrom(MANIFEST, [3], 2)).toEqual([3]);
  });

  it("orders turns numerically and drops a repeat", () => {
    expect(freshTurnsFrom(MANIFEST, [11, 3, 3], 10)).toEqual([3, 11]);
  });

  it.each([
    ["an object", { "2": true }, /array of turn numbers/],
    ["a string", "2", /array of turn numbers/],
    ["a turn given as text", ["two"], /not a turn number/],
    ["a fractional turn", [2.5], /not a turn number/],
    ["a negative turn", [-2], /not a turn number/],
  ])("refuses %s", (_name, declared, message) => {
    expect(() => freshTurnsFrom(MANIFEST, declared, 2)).toThrow(message);
  });

  it("refuses turn 1, which is a fresh session by definition and so hides a typo", () => {
    expect(() => freshTurnsFrom(MANIFEST, [1], 2)).toThrow(/turn 1/);
  });

  it("refuses a fresh turn with no scripted reply — a turn with nothing to say", () => {
    expect(() => freshTurnsFrom(MANIFEST, [3], 1)).toThrow(/scripts no reply for it/);
  });

  it("refuses an empty list, as it refuses an empty turns object", () => {
    expect(() => freshTurnsFrom(MANIFEST, [], 2)).toThrow(/lists no turn/);
  });
});
