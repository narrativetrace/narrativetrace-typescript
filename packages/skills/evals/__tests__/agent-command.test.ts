// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { buildAgentArgv, tokenizeCommandTemplate } from "../agent-command.js";

describe("tokenizeCommandTemplate", () => {
  it("splits on unquoted whitespace", () => {
    expect(tokenizeCommandTemplate("codex exec --model mini")).toEqual([
      "codex",
      "exec",
      "--model",
      "mini",
    ]);
  });

  it("keeps a double-quoted span as one token, quotes stripped", () => {
    expect(tokenizeCommandTemplate('claude -p "{prompt}" --model haiku')).toEqual([
      "claude",
      "-p",
      "{prompt}",
      "--model",
      "haiku",
    ]);
  });

  it("keeps a single-quoted span as one token, quotes stripped", () => {
    expect(tokenizeCommandTemplate("gemini -p '{prompt}' --model flash")).toEqual([
      "gemini",
      "-p",
      "{prompt}",
      "--model",
      "flash",
    ]);
  });

  it("preserves whitespace inside a quoted span as part of the one token", () => {
    expect(tokenizeCommandTemplate('echo "two words"')).toEqual(["echo", "two words"]);
  });

  it("returns an empty array for an empty template", () => {
    expect(tokenizeCommandTemplate("")).toEqual([]);
  });
});

describe("buildAgentArgv", () => {
  it("builds the claude preset argv with the prompt as one element", () => {
    const argv = buildAgentArgv('claude -p "{prompt}" --model haiku --allowed-tools Bash', "hi");
    expect(argv).toEqual(["claude", "-p", "hi", "--model", "haiku", "--allowed-tools", "Bash"]);
  });

  it("delivers a prompt containing backticks verbatim, not command-substituted", () => {
    const prompt = "check the `trap.redaction-proof` finding";
    const argv = buildAgentArgv('claude -p "{prompt}" --model haiku', prompt);
    expect(argv[2]).toBe(prompt);
  });

  it("delivers a prompt containing $(...) command substitution syntax verbatim", () => {
    const prompt = "run $(rm -rf /) and report back";
    const argv = buildAgentArgv('claude -p "{prompt}" --model haiku', prompt);
    expect(argv[2]).toBe(prompt);
  });

  it("delivers a prompt containing embedded double and single quotes verbatim", () => {
    const prompt = `say "hello" and 'goodbye'`;
    const argv = buildAgentArgv('claude -p "{prompt}" --model haiku', prompt);
    expect(argv[2]).toBe(prompt);
  });

  it("delivers a multi-line prompt verbatim, newlines included", () => {
    const prompt = "line one\nline two\n> quoted line three";
    const argv = buildAgentArgv('claude -p "{prompt}" --model haiku', prompt);
    expect(argv[2]).toBe(prompt);
  });

  it("builds the codex preset argv (double-quoted prompt at the end of the template)", () => {
    const argv = buildAgentArgv('codex exec --sandbox read-only --model mini "{prompt}"', "hi");
    expect(argv).toEqual(["codex", "exec", "--sandbox", "read-only", "--model", "mini", "hi"]);
  });

  it("leaves a template with no {prompt} placeholder unchanged (matches the old no-op)", () => {
    const argv = buildAgentArgv("echo static", "ignored prompt");
    expect(argv).toEqual(["echo", "static"]);
  });
});
