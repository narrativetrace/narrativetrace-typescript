// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  isPlatform,
  isReadOnlySkill,
  isSporadicPlatform,
  PLATFORMS,
  presetAgentCommand,
  presetFirstTurnCommand,
  presetResumedTurnCommand,
  SESSION_PLACEHOLDER,
  SPORADIC_PLATFORMS,
} from "../platform-presets.js";

describe("PLATFORMS / isPlatform", () => {
  it("accepts exactly claude, codex and gemini", () => {
    expect(PLATFORMS).toEqual(["claude", "codex", "gemini"]);
  });

  it("rejects an unknown platform string", () => {
    expect(isPlatform("mistral")).toBe(false);
    expect(isPlatform("")).toBe(false);
  });

  it("accepts every listed platform", () => {
    for (const platform of PLATFORMS) expect(isPlatform(platform)).toBe(true);
  });
});

describe("isSporadicPlatform", () => {
  it("is true for codex and gemini, false for claude", () => {
    expect(SPORADIC_PLATFORMS).toEqual(["codex", "gemini"]);
    expect(isSporadicPlatform("codex")).toBe(true);
    expect(isSporadicPlatform("gemini")).toBe(true);
    expect(isSporadicPlatform("claude")).toBe(false);
  });
});

describe("isReadOnlySkill", () => {
  it("is true only for narrativetrace-doctor", () => {
    expect(isReadOnlySkill("narrativetrace-doctor")).toBe(true);
    expect(isReadOnlySkill("add-narrative-tracing")).toBe(false);
    expect(isReadOnlySkill("")).toBe(false);
  });
});

describe("presetAgentCommand", () => {
  it("builds the claude preset with the requested model and the prompt-implied tools", () => {
    expect(presetAgentCommand("claude", "haiku", "narrativetrace-doctor")).toBe(
      'claude -p "{prompt}" --model haiku --allowed-tools "Bash,Read,Edit,Write,WebFetch,Skill"' +
        " --strict-mcp-config --output-format stream-json --verbose",
    );
  });

  it("loads no MCP server at all on the claude lane — not even the account's own connectors", () => {
    expect(presetAgentCommand("claude", "haiku", "narrativetrace-feedback")).toContain(
      "--strict-mcp-config",
    );
  });

  it("streams the claude lane's tool calls, not only its closing text — the grader reads both", () => {
    expect(presetAgentCommand("claude", "haiku", "narrativetrace-feedback")).toContain(
      "--output-format stream-json --verbose",
    );
  });

  it("lets the claude lane INVOKE a skill — the published prompt's step 4 says to follow one", () => {
    expect(presetAgentCommand("claude", "haiku", "add-narrative-tracing")).toContain("Skill");
  });

  it("builds the codex preset in the read-only sandbox for a read-only skill", () => {
    expect(presetAgentCommand("codex", "mini", "narrativetrace-doctor")).toBe(
      'codex exec --sandbox read-only --skip-git-repo-check --model mini "{prompt}"',
    );
  });

  it("builds the codex preset in the workspace-write sandbox for a non-read-only skill", () => {
    expect(presetAgentCommand("codex", "mini", "add-narrative-tracing")).toBe(
      'codex exec --sandbox workspace-write --skip-git-repo-check --model mini "{prompt}"',
    );
  });

  it("codex preset always skips the git-repo/trust check — the scaffolded fixture is a scratch temp dir, never a trusted project or a git repo", () => {
    expect(presetAgentCommand("codex", "mini", "narrativetrace-doctor")).toContain(
      "--skip-git-repo-check",
    );
  });

  it("builds the gemini preset in plan (read-only) approval mode for a read-only skill", () => {
    expect(presetAgentCommand("gemini", "flash", "narrativetrace-doctor")).toBe(
      'gemini -p "{prompt}" --model flash --approval-mode plan',
    );
  });

  it("builds the gemini preset in auto_edit approval mode for a non-read-only skill", () => {
    expect(presetAgentCommand("gemini", "flash", "add-narrative-tracing")).toBe(
      'gemini -p "{prompt}" --model flash --approval-mode auto_edit',
    );
  });
});

describe("presetFirstTurnCommand / presetResumedTurnCommand", () => {
  it("opens a claude conversation under the trial's own session id", () => {
    expect(presetFirstTurnCommand("claude", "haiku", "narrativetrace-feedback")).toBe(
      `${presetAgentCommand("claude", "haiku", "narrativetrace-feedback")} --session-id ${SESSION_PLACEHOLDER}`,
    );
  });

  it("resumes that same conversation, never forks it, on every later turn", () => {
    expect(presetResumedTurnCommand("claude", "haiku", "narrativetrace-feedback")).toBe(
      `${presetAgentCommand("claude", "haiku", "narrativetrace-feedback")} --resume ${SESSION_PLACEHOLDER}`,
    );
  });

  it.each([
    "codex",
    "gemini",
  ] as const)("has neither half for %s, whose multi-turn flags were never verified here", (platform) => {
    expect(presetFirstTurnCommand(platform, "m", "narrativetrace-feedback")).toBeUndefined();
    expect(presetResumedTurnCommand(platform, "m", "narrativetrace-feedback")).toBeUndefined();
  });
});
