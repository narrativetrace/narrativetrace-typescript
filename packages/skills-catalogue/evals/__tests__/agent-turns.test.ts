// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { agentTurns, commandForTurn, type TurnsRequest } from "../agent-turns.js";
import { presetAgentCommand } from "../platform-presets.js";

/**
 * What drives a trial's agent: one template per turn, one prompt per turn, and the session id that
 * makes several turns ONE conversation. Every way of being wrong is refused rather than degraded: a
 * multi-turn case quietly run as unrelated single turns reaches its approval question with an agent
 * that forgot the draft, and passes "nothing was filed" for a reason unrelated to the gate.
 */

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";

function request(overrides: Partial<TurnsRequest> = {}): TurnsRequest {
  return {
    platform: "claude",
    model: "claude-haiku-5-5",
    skill: "narrativetrace-feedback",
    firstPrompt: "please report this",
    replies: [],
    sessionId: SESSION,
    ...overrides,
  };
}

describe("agentTurns — one turn", () => {
  it("runs the platform's single-turn preset with no session, as every case did before", () => {
    const turns = agentTurns(request());
    expect(turns.prompts).toEqual(["please report this"]);
    expect(commandForTurn(turns, 1)).toBe(
      presetAgentCommand("claude", "claude-haiku-5-5", "narrativetrace-feedback"),
    );
  });

  it("honours an operator's --agent-command override", () => {
    const turns = agentTurns(request({ override: 'my-agent "{prompt}"' }));
    expect(commandForTurn(turns, 1)).toBe('my-agent "{prompt}"');
  });

  it("drives no agent at all for an empty override — the fixture is graded as it stands", () => {
    expect(commandForTurn(agentTurns(request({ override: "" })), 1)).toBeUndefined();
  });

  it("does not need a well-shaped session id, because it opens no session", () => {
    expect(() => agentTurns(request({ sessionId: "not a uuid" }))).not.toThrow();
  });
});

describe("agentTurns — a conversation", () => {
  const twoTurns = () => agentTurns(request({ replies: ["yes, file it"] }));

  it("hands prompt.md to turn 1 and each scripted reply to the turn after", () => {
    expect(twoTurns().prompts).toEqual(["please report this", "yes, file it"]);
  });

  it("opens the session in turn 1 and resumes the same id in every later turn", () => {
    const turns = agentTurns(request({ replies: ["a", "b"] }));
    expect(commandForTurn(turns, 1)).toMatch(new RegExp(`--session-id ${SESSION}$`));
    expect(commandForTurn(turns, 2)).toMatch(new RegExp(`--resume ${SESSION}$`));
    expect(commandForTurn(turns, 3)).toBe(commandForTurn(turns, 2));
  });

  it("refuses an override: one template cannot both open a session and resume it", () => {
    expect(() =>
      agentTurns(request({ replies: ["yes"], override: 'claude -p "{prompt}"' })),
    ).toThrow(/one --agent-command cannot be both/);
  });

  it.each([
    "",
    "abc",
    `${SESSION} --dangerously-skip-permissions`,
    `"${SESSION}"`,
  ])("refuses a session id that is not one opaque uuid token: %j", (sessionId) => {
    expect(() => agentTurns(request({ replies: ["yes"], sessionId }))).toThrow(/opaque token/);
  });

  it.each([
    "codex",
    "gemini",
  ] as const)("refuses %s, whose multi-turn flags were never verified in this container", (platform) => {
    expect(() => agentTurns(request({ platform, replies: ["yes"] }))).toThrow(
      new RegExp(`${platform} cannot drive a multi-turn case`),
    );
  });
});

describe("agentTurns — prompts", () => {
  it.each([
    ["a blank prompt.md", { firstPrompt: "  \n" }],
    ["a blank reply", { replies: ["yes", " "] }],
  ])("refuses %s — a turn with nothing to say cannot be driven", (_label, overrides) => {
    expect(() => agentTurns(request(overrides))).toThrow(/blank prompt/);
  });
});

describe("commandForTurn", () => {
  it.each([0, 3, -1, 1.5])("refuses turn %s outside a conversation of two", (turn) => {
    const turns = agentTurns(request({ replies: ["yes"] }));
    expect(() => commandForTurn(turns, turn)).toThrow(/outside a conversation of 2/);
  });
});
