// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { randomUUID } from "node:crypto";
import {
  type Platform,
  presetAgentCommand,
  presetFirstTurnCommand,
  presetResumedTurnCommand,
  SESSION_PLACEHOLDER,
} from "./platform-presets.js";

/**
 * INTENT: everything that drives a trial's agent — one command template per turn, one prompt per
 * turn, and the session id that makes several turns ONE conversation rather than several unrelated
 * ones.
 *
 * A single-turn trial is the ordinary shape: one prompt, the platform's preset (or the operator's
 * override), no session. A multi-turn trial is what a case needs when what it measures must happen
 * in a LATER turn than the one that asked — an approval is only an approval if it arrives in a turn
 * of the user's own.
 *
 * @llmNote Every way of being wrong is REFUSED here rather than degraded, and that is the
 * load-bearing decision in this module: a multi-turn case quietly run as independent single turns
 * would reach its approval question with an agent that had forgotten the draft, then pass its
 * grader — "nothing was filed" — for a reason that has nothing to do with the gate.
 */
export interface AgentTurns {
  /** Turn 1's template, or `undefined` to drive no agent and grade the fixture as it stands. */
  readonly firstTurnCommand: string | undefined;
  /** The template every later turn uses, the session id substituted; `undefined` for one turn. */
  readonly resumedTurnCommand: string | undefined;
  /** One per turn, in order: `prompt.md`, then the case's scripted replies. */
  readonly prompts: readonly string[];
  /**
   * The command of every turn that opens a NEW session instead of resuming: the first-turn template
   * under a session id of its own. Empty for a case that resumes every turn.
   */
  readonly freshTurnCommands: ReadonlyMap<number, string>;
}

export interface TurnsRequest {
  readonly platform: Platform;
  readonly model: string;
  readonly skill: string;
  /** An operator's explicit `--agent-command`, or `undefined` for the platform's preset. */
  readonly override?: string | undefined;
  readonly firstPrompt: string;
  readonly replies: readonly string[];
  /** The id this TRIAL's conversation is opened and resumed under — never shared across trials. */
  readonly sessionId: string;
  /** The scripted turns (2 and up) that open a fresh session; see `case-turns.ts`. */
  readonly freshTurns?: readonly number[] | undefined;
  /** Mints the id of one fresh session; a uuid each call by default. */
  readonly freshSessionId?: (() => string) | undefined;
}

/**
 * One opaque token. An id carrying whitespace or a quote would split into two argv elements and
 * silently change the command it was spliced into.
 */
const SESSION_ID = /^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/;

/**
 * What drives this case on this platform.
 *
 * @throws {Error} for a blank prompt; for a multi-turn case, when an override is given, when the
 * session id is not one uuid token, or when the platform cannot resume a session.
 */
export function agentTurns(request: TurnsRequest): AgentTurns {
  const prompts = [request.firstPrompt, ...request.replies];
  if (prompts.some((prompt) => prompt.trim() === "")) {
    throw new Error("a turn with a blank prompt cannot be driven");
  }
  if (prompts.length === 1) {
    const { platform, model, skill, override } = request;
    const first = override ?? presetAgentCommand(platform, model, skill);
    return {
      firstTurnCommand: first === "" ? undefined : first,
      resumedTurnCommand: undefined,
      prompts,
      freshTurnCommands: new Map(),
    };
  }
  requireNoOverride(request.override);
  requireOpaqueSessionId(request.sessionId);
  return {
    firstTurnCommand: named(presetFirstTurnCommand, request, request.sessionId),
    resumedTurnCommand: named(presetResumedTurnCommand, request, request.sessionId),
    prompts,
    freshTurnCommands: freshCommands(request, prompts.length),
  };
}

/**
 * A fresh turn must be the last: the turn after it would have to resume the NEW session, and the
 * resumed template carries the old id — so the shape is refused rather than resumed silently.
 */
function freshCommands(request: TurnsRequest, turnCount: number): ReadonlyMap<number, string> {
  const commands = new Map<number, string>();
  for (const turn of request.freshTurns ?? []) {
    if (!Number.isInteger(turn) || turn < 2 || turn > turnCount) {
      throw new Error(`fresh turn ${turn} is outside a conversation of ${turnCount}`);
    }
    if (turn !== turnCount) {
      throw new Error(
        "a fresh turn must be the last turn: the turn after it would have to resume the NEW " +
          "session, and nothing here carries its id",
      );
    }
    const id = (request.freshSessionId ?? randomUUID)();
    requireOpaqueSessionId(id);
    commands.set(turn, named(presetFirstTurnCommand, request, id));
  }
  return commands;
}

/**
 * A multi-turn case runs on its platform's preset pair: one override string cannot be two
 * templates, and the one it would be is the FIRST turn's — so an accepted override would run every
 * later turn as a fresh conversation.
 */
function requireNoOverride(override: string | undefined): void {
  if (override !== undefined) {
    throw new Error(
      "a multi-turn case runs on its platform's preset: one --agent-command cannot be both the " +
        "template that opens a session and the one that resumes it",
    );
  }
}

function requireOpaqueSessionId(sessionId: string): void {
  if (!SESSION_ID.test(sessionId)) {
    throw new Error(
      `a multi-turn trial's session id must be one opaque token (a uuid), not ${JSON.stringify(sessionId)}`,
    );
  }
}

/** This trial's own id in place of the preset's placeholder. */
function named(
  preset: (platform: Platform, model: string, skill: string) => string | undefined,
  request: TurnsRequest,
  sessionId: string,
): string {
  const template = preset(request.platform, request.model, request.skill);
  if (template === undefined) {
    throw new Error(
      `${request.platform} cannot drive a multi-turn case: its multi-turn flags have never been ` +
        "verified in the container the trials run in",
    );
  }
  return template.replace(SESSION_PLACEHOLDER, sessionId);
}

/**
 * The template `turn` (1-based) runs, the session id already in it — a caller hands it straight to
 * `buildAgentArgv`, which only ever substitutes the prompt.
 *
 * @throws {Error} for a turn outside the conversation.
 */
export function commandForTurn(turns: AgentTurns, turn: number): string | undefined {
  if (!Number.isInteger(turn) || turn < 1 || turn > turns.prompts.length) {
    throw new Error(`turn ${turn} is outside a conversation of ${turns.prompts.length}`);
  }
  return (
    turns.freshTurnCommands.get(turn) ??
    (turn === 1 ? turns.firstTurnCommand : turns.resumedTurnCommand)
  );
}

/**
 * Whether `turn` (1-based) opens a new session rather than resuming the conversation.
 *
 * @throws {Error} for a turn outside the conversation.
 */
export function isFreshTurn(turns: AgentTurns, turn: number): boolean {
  commandForTurn(turns, turn);
  return turns.freshTurnCommands.has(turn);
}
