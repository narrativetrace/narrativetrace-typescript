// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRestoreExceptions, restoreExceptions } from "../publish-restore-exceptions.js";

describe("parseRestoreExceptions", () => {
  it("extracts `!`-prefixed lines only, in file order", () => {
    const ignoreText = ["CLAUDE.md", "!.claude/skills", "reports", "!AGENTS.md"].join("\n");
    expect(parseRestoreExceptions(ignoreText)).toEqual([".claude/skills", "AGENTS.md"]);
  });

  it("skips comments and blank lines", () => {
    const ignoreText = ["# a comment", "", "  ", "!.claude/skills"].join("\n");
    expect(parseRestoreExceptions(ignoreText)).toEqual([".claude/skills"]);
  });

  it("strips a trailing /** — a whole-directory restore already implies everything under it", () => {
    expect(parseRestoreExceptions("!.claude/skills/**")).toEqual([".claude/skills"]);
  });

  it("returns nothing for a file with no exception lines", () => {
    expect(parseRestoreExceptions("CLAUDE.md\n.claude\nreports\n")).toEqual([]);
  });
});

describe("restoreExceptions", () => {
  let stageRoot: string;
  let pristineRoot: string;

  beforeEach(() => {
    stageRoot = mkdtempSync(join(tmpdir(), "publish-restore-stage-"));
    pristineRoot = mkdtempSync(join(tmpdir(), "publish-restore-pristine-"));
  });

  afterEach(() => {
    rmSync(stageRoot, { recursive: true, force: true });
    rmSync(pristineRoot, { recursive: true, force: true });
  });

  it("copies a directory a strip pattern removed back from the pristine snapshot", () => {
    mkdirSync(join(pristineRoot, ".claude", "skills", "doctor"), { recursive: true });
    writeFileSync(join(pristineRoot, ".claude", "skills", "doctor", "SKILL.md"), "doctor content");
    // The stage never had it — the broader `.claude` strip already ran.
    expect(existsSync(join(stageRoot, ".claude"))).toBe(false);

    const { restored, missing } = restoreExceptions(stageRoot, pristineRoot, [".claude/skills"]);

    expect(restored).toEqual([".claude/skills"]);
    expect(missing).toEqual([]);
    expect(readFileSync(join(stageRoot, ".claude", "skills", "doctor", "SKILL.md"), "utf-8")).toBe(
      "doctor content",
    );
  });

  it("leaves a sibling path the exception did not name untouched", () => {
    mkdirSync(join(pristineRoot, ".claude", "skills"), { recursive: true });
    writeFileSync(join(pristineRoot, ".claude", "skills", "SKILL.md"), "content");
    writeFileSync(join(pristineRoot, ".claude", "settings.local.json"), "{}");

    restoreExceptions(stageRoot, pristineRoot, [".claude/skills"]);

    expect(existsSync(join(stageRoot, ".claude", "skills", "SKILL.md"))).toBe(true);
    expect(existsSync(join(stageRoot, ".claude", "settings.local.json"))).toBe(false);
  });

  it("reports a path absent from the pristine snapshot as missing, and restores nothing for it", () => {
    const { restored, missing } = restoreExceptions(stageRoot, pristineRoot, [
      ".claude/does-not-exist",
    ]);

    expect(restored).toEqual([]);
    expect(missing).toEqual([".claude/does-not-exist"]);
  });

  it("overwrites a stub already at the destination rather than merging with it", () => {
    mkdirSync(join(pristineRoot, "AGENTS.md.d"), { recursive: true });
    writeFileSync(join(pristineRoot, "AGENTS.md.d", "section.md"), "fresh");
    mkdirSync(join(stageRoot, "AGENTS.md.d"), { recursive: true });
    writeFileSync(join(stageRoot, "AGENTS.md.d", "stale.md"), "stale");

    restoreExceptions(stageRoot, pristineRoot, ["AGENTS.md.d"]);

    expect(existsSync(join(stageRoot, "AGENTS.md.d", "stale.md"))).toBe(false);
    expect(readFileSync(join(stageRoot, "AGENTS.md.d", "section.md"), "utf-8")).toBe("fresh");
  });
});
