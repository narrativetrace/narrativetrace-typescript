// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * INTENT: the scripted user replies that drive a Tier B case past its first turn, read from the
 * `"turns"` field of the case's own `case.json`, beside the fixture it names.
 *
 * A case without them is one turn: the agent is handed `prompt.md` and whatever it does with that
 * is the whole trial. A case WITH them is a conversation the runner drives, and that is the only
 * way to measure something that must happen in a LATER turn than the one that asked — an approval.
 *
 * Keyed BY TURN NUMBER (`"turns": { "2": "yes, file it" }`) rather than a bare array, because the
 * turn a reply is given at is the subject of these cases and an array leaves it implicit. Turn 1 is
 * always `prompt.md` and may not be declared here. The case file is the ONE home of the reply: the
 * graders read the same field, because a copy of it drifted within the hour in the reference
 * implementation and failed a compliant trial.
 *
 * @llmNote Every way of being wrong THROWS rather than degrading to a shorter conversation. A case
 * whose second turn silently did not happen passes its approval grader for the wrong reason —
 * nothing was filed because nothing was asked.
 */

/**
 * A canonical whole number: no sign, no padding. `"02"` would alias turn 2, and only canonical
 * integer keys are the ones a JavaScript object enumerates in ascending numeric order — which is
 * what makes the replies come out in turn order without a sort.
 */
const TURN_KEY = /^(0|[1-9][0-9]*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A key is a turn number, and the first turn a reply can be given at is the second. */
function turnNumber(manifestPath: string, key: string): number {
  if (!TURN_KEY.test(key)) {
    throw new Error(`${manifestPath} declares a turn keyed "${key}", which is not a turn number`);
  }
  const turn = Number(key);
  if (turn < 2) {
    throw new Error(
      `${manifestPath} declares a reply at turn ${turn} — turn 1 is the case's own prompt.md, ` +
        "so the first reply is turn 2",
    );
  }
  return turn;
}

function reply(manifestPath: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${manifestPath} declares a blank reply — a turn with nothing to say cannot be driven`,
    );
  }
  return value;
}

/**
 * Turns 2..n with nothing missing. A gap is a turn with no input, and closing it quietly would hand
 * a later turn's reply to an earlier one — for an approval case, the difference between a question
 * answered and a question never asked.
 */
function requireContiguous(manifestPath: string, turns: readonly number[]): void {
  turns.forEach((declared, index) => {
    const expected = index + 2;
    if (declared !== expected) {
      throw new Error(
        `${manifestPath} declares no reply for turn ${expected}, so turn ${declared} could never be reached`,
      );
    }
  });
}

/**
 * The replies `turns` (the manifest's parsed `"turns"` field) declares, in turn order; empty when
 * the field is absent.
 *
 * @throws {Error} naming `manifestPath` for a field that is not an object of turn → reply, an empty
 * one, a key that is not a whole turn number from 2 up, a gap, or a blank reply.
 */
export function scriptedReplies(manifestPath: string, turns: unknown): readonly string[] {
  if (turns === undefined) return [];
  if (!isRecord(turns)) {
    throw new Error(`${manifestPath} must declare "turns" as an object keyed by turn number`);
  }
  const entries = Object.entries(turns).map(
    ([key, value]) => [turnNumber(manifestPath, key), reply(manifestPath, value)] as const,
  );
  if (entries.length === 0)
    throw new Error(`${manifestPath} declares "turns" and lists no reply in it`);
  requireContiguous(
    manifestPath,
    entries.map(([turn]) => turn),
  );
  return entries.map(([, text]) => text);
}
