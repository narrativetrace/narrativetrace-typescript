// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  CURSOR_RULE_TEXT,
  PLATFORM_ROWS,
  platformRowById,
} from "../../src/platforms/platform-table.js";

function row(id: string) {
  const found = platformRowById(id);
  if (found === undefined) throw new Error(`no row ${id}`);
  return found;
}

describe("the platform table", () => {
  /** The ids name a row in the docs page, the doctor's lines and the ports' tables: a contract. */
  test("lists the five platforms in their published order", () => {
    expect(PLATFORM_ROWS.map((each) => each.id)).toEqual([
      "cursor",
      "replit",
      "antigravity",
      "github-copilot",
      "claude-code",
    ]);
  });

  test("Cursor is detected by its directory and pointed at by one rule", () => {
    const cursor = row("cursor");
    expect(cursor.markerPaths).toEqual([".cursor"]);
    expect(cursor.pointer.kind).toBe("rule");
    expect(cursor.pointer.path).toBe(".cursor/rules/narrativetrace.mdc");
    expect(cursor.pointer.kind === "rule" && cursor.pointer.text).toContain(".agents/skills");
    expect(cursor.evidenceLane).toBe("cursor");
  });

  test("Replit is detected by either of its files and carries the managed section", () => {
    const replit = row("replit");
    expect(replit.markerPaths).toEqual(["replit.md", ".replit"]);
    expect(replit.pointer).toEqual({ kind: "managed-section", path: "replit.md" });
    expect(replit.installPath).toContain("GitHub");
    expect(replit.evidenceLane).toBe("manual");
  });

  test("Antigravity and Copilot need no pointer: they read the open standard directly", () => {
    expect(row("antigravity").pointer).toEqual({ kind: "none", path: "" });
    expect(row("antigravity").markerPaths).toEqual([
      ".agents/rules",
      ".agents/workflows",
      ".agent",
    ]);
    expect(row("antigravity").installPath).toContain("run `narrativetrace init` in the project");
    expect(row("antigravity").evidenceLane).toBe("antigravity");
    expect(row("github-copilot").pointer.kind).toBe("none");
    expect(row("github-copilot").markerPaths).toEqual([".github/copilot-instructions.md"]);
  });

  test("Claude Code is the native platform with the Claude lane", () => {
    expect(row("claude-code").markerPaths).toEqual([".claude"]);
    expect(row("claude-code").pointer.kind).toBe("none");
    expect(row("claude-code").evidenceLane).toBe("claude");
  });

  test("every row carries the date its facts were verified", () => {
    for (const each of PLATFORM_ROWS) expect(each.verified).toBe("2026-10-10");
  });

  test("an unknown or near-miss id is no row", () => {
    expect(platformRowById("cursorx")).toBeUndefined();
  });

  /**
   * The whole table, column by column. The ids and lanes are a cross-port contract and every other
   * column is printed on the docs page, so a reworded cell is a deliberate edit of this list too.
   */
  test("pins every column of every row", () => {
    expect(
      PLATFORM_ROWS.map((r) => [
        r.id,
        r.name,
        r.markerPaths,
        r.pointer.kind,
        r.pointer.path,
        r.evidenceLane,
      ]),
    ).toEqual([
      ["cursor", "Cursor", [".cursor"], "rule", ".cursor/rules/narrativetrace.mdc", "cursor"],
      ["replit", "Replit", ["replit.md", ".replit"], "managed-section", "replit.md", "manual"],
      [
        "antigravity",
        "Antigravity",
        [".agents/rules", ".agents/workflows", ".agent"],
        "none",
        "",
        "antigravity",
      ],
      [
        "github-copilot",
        "GitHub Copilot",
        [".github/copilot-instructions.md"],
        "none",
        "",
        "manual",
      ],
      ["claude-code", "Claude Code", [".claude"], "none", "", "claude"],
    ]);
  });

  test("pins the install path and what the agent finds, for every row", () => {
    expect(PLATFORM_ROWS.map((r) => [r.installPath, r.agentFinds])).toEqual([
      [
        "Install the plugin from the public repository's `.cursor-plugin` manifest, or run `narrativetrace init` in the project",
        "the skills in `.agents/skills` (Cursor also reads `.claude/skills`), and the one rule `.cursor/rules/narrativetrace.mdc` that points at them",
      ],
      [
        "Import the public repository from GitHub (paste its URL, preview the skills, add them), or run `narrativetrace init` in the project",
        "the skills in `.agents/skills`, and a NarrativeTrace section in `replit.md`, the project memory the Replit agent reads first",
      ],
      [
        "Nothing to install beyond the project itself: run `narrativetrace init` in the project and commit the skills (the `agy` CLI and the IDE read them as workspace skills)",
        "the skills in `.agents/skills`, which Antigravity reads as workspace skills, and the section in `AGENTS.md`, which it loads as rules",
      ],
      [
        "Nothing to install beyond the repository itself: run `narrativetrace init` in the project and commit the skills",
        "the skills in `.agents/skills` (Copilot also reads `.claude/skills` and `.github/skills`), and the section in `AGENTS.md`",
      ],
      [
        "Add the repository as a plugin marketplace and install its plugin, or run `narrativetrace init` in the project",
        "the skills in `.claude/skills` and `.agents/skills`, and the section in `AGENTS.md` that `CLAUDE.md` imports",
      ],
    ]);
  });

  test("the Cursor rule's sentence is the one the plugin and init both ship", () => {
    expect(CURSOR_RULE_TEXT).toBe(
      "The NarrativeTrace skills live under `.agents/skills` — read them before changing traced code, and run the NarrativeTrace doctor to check the install.",
    );
    expect(row("cursor").pointer).toEqual({
      kind: "rule",
      path: ".cursor/rules/narrativetrace.mdc",
      text: CURSOR_RULE_TEXT,
    });
  });
});
