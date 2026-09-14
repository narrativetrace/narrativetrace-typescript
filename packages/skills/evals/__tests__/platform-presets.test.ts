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
  it("builds the claude preset with the requested model", () => {
    expect(presetAgentCommand("claude", "haiku", "narrativetrace-doctor")).toBe(
      'claude -p "{prompt}" --model haiku --allowed-tools Bash',
    );
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
