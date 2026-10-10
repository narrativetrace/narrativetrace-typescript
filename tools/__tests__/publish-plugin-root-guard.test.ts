// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPluginRoot } from "../publish-plugin-root-guard.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

describe("checkPluginRoot", () => {
  let stage: string;

  beforeEach(() => {
    stage = mkdtempSync(join(tmpdir(), "plugin-root-guard-"));
  });

  afterEach(() => {
    rmSync(stage, { recursive: true, force: true });
  });

  it("is ok when the staged .claude/ holds only skills/", () => {
    mkdirSync(join(stage, ".claude", "skills", "doctor"), { recursive: true });
    expect(checkPluginRoot(stage)).toEqual({ ok: true, strays: [] });
  });

  it("names a stray directory under .claude/ that is not skills/", () => {
    mkdirSync(join(stage, ".claude", "skills"), { recursive: true });
    mkdirSync(join(stage, ".claude", "commands"), { recursive: true });

    const result = checkPluginRoot(stage);

    expect(result.ok).toBe(false);
    expect(result.strays).toEqual([".claude/commands"]);
  });

  it("names a stray FILE under .claude/ too, not only directories", () => {
    mkdirSync(join(stage, ".claude", "skills"), { recursive: true });
    writeFileSync(join(stage, ".claude", "settings.local.json"), "{}");

    const result = checkPluginRoot(stage);

    expect(result.strays).toEqual([".claude/settings.local.json"]);
  });

  it("names every stray, not just the first", () => {
    mkdirSync(join(stage, ".claude", "skills"), { recursive: true });
    mkdirSync(join(stage, ".claude", "commands"), { recursive: true });
    mkdirSync(join(stage, ".claude", "agents"), { recursive: true });

    const result = checkPluginRoot(stage);

    expect(new Set(result.strays)).toEqual(new Set([".claude/commands", ".claude/agents"]));
  });

  it("errors when the plugin root is missing entirely from the snapshot", () => {
    const result = checkPluginRoot(stage);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/plugin root \(\.claude\/\) is missing/);
  });

  it("errors when .claude exists but is a file, not a directory", () => {
    writeFileSync(join(stage, ".claude"), "not a directory");

    expect(checkPluginRoot(stage).error).toBeDefined();
  });
});

describe("the real .publishignore strip leaves .claude-plugin/ alone", () => {
  let stage: string;

  beforeEach(() => {
    stage = mkdtempSync(join(tmpdir(), "publishignore-strip-"));
  });

  afterEach(() => {
    rmSync(stage, { recursive: true, force: true });
  });

  /**
   * Mirrors the publish pipeline's own strip loop exactly (same unquoted `rm -rf $pattern` over
   * every non-comment, non-exception line) against the REAL `.publishignore` — not a
   * reimplementation's idea of what it does. `.claude` is stripped whole (no glob metacharacters,
   * so `rm -rf .claude` removes only the literal path), and `.claude-plugin` is a sibling
   * directory the pattern never names: proves the near-miss (two paths sharing a prefix but not a
   * delimiter) is actually safe, not just assumed safe.
   */
  it("the .claude strip pattern never removes the sibling .claude-plugin directory", (ctx) => {
    if (!existsSync(join(REPO_ROOT, ".publishignore"))) {
      ctx.skip("precondition absent: .publishignore is stripped from the public snapshot");
    }
    mkdirSync(join(stage, ".claude", "skills", "doctor"), { recursive: true });
    writeFileSync(join(stage, ".claude", "settings.local.json"), "{}");
    mkdirSync(join(stage, ".claude-plugin"), { recursive: true });
    writeFileSync(join(stage, ".claude-plugin", "marketplace.json"), "{}");

    execFileSync("bash", [
      "-c",
      `cd "$1" && while IFS= read -r pattern; do
         case "$pattern" in ''|'#'*) continue ;; esac
         case "$pattern" in '!'*) continue ;; esac
         rm -rf $pattern 2>/dev/null || true
       done < "$2"`,
      "--",
      stage,
      join(REPO_ROOT, ".publishignore"),
    ]);

    expect(existsSync(join(stage, ".claude"))).toBe(false);
    expect(existsSync(join(stage, ".claude-plugin", "marketplace.json"))).toBe(true);
  });
});
