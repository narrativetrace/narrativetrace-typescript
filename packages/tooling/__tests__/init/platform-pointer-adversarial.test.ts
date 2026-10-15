// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderCursorRule } from "../../src/init/cursor-rule.js";
import { initOptions } from "../../src/init/init-options.js";
import { planRefusals } from "../../src/init/init-plan.js";
import { planInstall } from "../../src/init/init-planner.js";
import { applyPlan } from "../../src/init/plan-executor.js";
import { readProjectState } from "../../src/init/project-state-reader.js";
import { planUninstall } from "../../src/init/uninstall-planner.js";
import { CURSOR_RULE_TEXT } from "../../src/platforms/platform-table.js";
import { fakeCarrier } from "./fixtures.js";
import { inATemporaryProject, snapshotOf } from "./projects.js";

/**
 * Adversarial round trips for the platform pointers on a real temporary project: CRLF and
 * byte-order-marked files, a second install, uninstall after install, near-miss markers and links.
 * Named after `PlatformPointerAdversarialTest` in the Java reference so the two lists diff.
 */

const BOM = "﻿";
const RULE = ".cursor/rules/narrativetrace.mdc";
const PERMISSIVE = initOptions({ writeExisting: true });
const CARRIER = fakeCarrier(["a"]);

function put(project: string, relative: string, content: string): void {
  const file = join(project, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const read = (project: string, relative: string) => readFileSync(join(project, relative), "utf8");
const crlf = (text: string) => text.replaceAll("\n", "\r\n");

function install(project: string, options = initOptions()) {
  return planInstall(readProjectState(project), CARRIER, options);
}

function applyInstall(project: string, options = PERMISSIVE): void {
  applyPlan(install(project, options), project);
}

function applyUninstall(project: string): void {
  applyPlan(planUninstall(readProjectState(project)), project);
}

function roundTrips(files: Record<string, string>, directories: string[] = []): void {
  inATemporaryProject("nt-pointer-roundtrip-", (project) => {
    for (const [path, text] of Object.entries(files)) put(project, path, text);
    for (const directory of directories) mkdirSync(join(project, directory), { recursive: true });
    const before = snapshotOf(project);
    applyInstall(project);
    applyUninstall(project);
    expect(snapshotOf(project)).toEqual(before);
  });
}

describe("install then uninstall", () => {
  test("leaves a CRLF replit.md byte-identical", () => {
    roundTrips({ ".replit": 'run = "x"\n', "replit.md": "# Notes\r\n\r\nHello\r\n" });
  });

  test("leaves a byte-order-marked replit.md byte-identical", () => {
    roundTrips({ ".replit": "x\n", "replit.md": `${BOM}# Notes\n` });
  });

  test("restores a whole mixed project — two markers, CLAUDE.md, CRLF — byte for byte", () => {
    roundTrips(
      { ".replit": "x\n", "CLAUDE.md": "# Claude\n", "replit.md": crlf("# Notes\n\nHello\n") },
      [".cursor"],
    );
  });

  test("a file with no final newline comes back with one newline and nothing else", () => {
    inATemporaryProject("nt-pointer-nonl-", (project) => {
      put(project, ".replit", "x\n");
      put(project, "replit.md", "# Notes");
      applyInstall(project);
      applyUninstall(project);
      expect(read(project, "replit.md")).toBe("# Notes\n");
    });
  });

  test("keeps the user's notes written below a replit.md the installer created", () => {
    inATemporaryProject("nt-pointer-notes-", (project) => {
      put(project, ".replit", "x\n");
      applyInstall(project, initOptions());
      put(project, "replit.md", `${read(project, "replit.md")}My notes\n`);
      applyUninstall(project);
      expect(read(project, "replit.md")).toBe("My notes\n");
    });
  });
});

describe("a second install", () => {
  test("over a fully installed mixed project plans nothing", () => {
    inATemporaryProject("nt-pointer-second-", (project) => {
      put(project, ".replit", "x\n");
      put(project, "CLAUDE.md", "# Claude\n");
      put(project, "replit.md", crlf("# Notes\n"));
      mkdirSync(join(project, ".cursor"));
      applyInstall(project);
      expect(install(project, PERMISSIVE).actions).toEqual([]);
    });
  });

  test("a CRLF Cursor rule that is already current is not rewritten", () => {
    inATemporaryProject("nt-pointer-crlf-rule-", (project) => {
      mkdirSync(join(project, ".cursor"));
      applyInstall(project);
      put(project, RULE, crlf(read(project, RULE)));
      expect(install(project).actions).toEqual([]);
    });
  });
});

describe("the Cursor rule on disk", () => {
  test("is deleted on uninstall even when an editor added a byte-order mark and CRLF", () => {
    inATemporaryProject("nt-pointer-bom-rule-", (project) => {
      mkdirSync(join(project, ".cursor"));
      applyInstall(project);
      put(project, RULE, BOM + crlf(read(project, RULE)));
      applyUninstall(project);
      expect(existsSync(join(project, RULE))).toBe(false);
    });
  });

  test("keeps the user's CRLF lines below the section on uninstall", () => {
    inATemporaryProject("nt-pointer-keep-", (project) => {
      mkdirSync(join(project, ".cursor"));
      applyInstall(project);
      put(project, RULE, `${crlf(read(project, RULE))}Custom line\r\n`);
      applyUninstall(project);
      expect(read(project, RULE)).toBe(
        "---\r\ndescription: Where the NarrativeTrace agent skills live in this project\r\nalwaysApply: true\r\n---\r\nCustom line\r\n",
      );
    });
  });

  test("two sections are refused and the file is left alone", () => {
    inATemporaryProject("nt-pointer-two-", (project) => {
      mkdirSync(join(project, ".cursor"));
      const rule = renderCursorRule(CURSOR_RULE_TEXT, CARRIER.coordinate);
      put(project, RULE, `${rule}\n${rule}`);
      const plan = install(project);
      expect(planRefusals(plan).map((action) => action.path)).toContain(RULE);
      applyPlan(plan, project);
      expect(read(project, RULE)).toBe(`${rule}\n${rule}`);
    });
  });
});

describe("a marker that is not one", () => {
  test("a .cursorx directory is not Cursor: no .cursor directory appears", () => {
    inATemporaryProject("nt-pointer-near-", (project) => {
      mkdirSync(join(project, ".cursorx"));
      applyInstall(project);
      expect(existsSync(join(project, ".cursor"))).toBe(false);
    });
  });

  test("a replit.mdx file is not Replit: no replit.md appears", () => {
    inATemporaryProject("nt-pointer-near-replit-", (project) => {
      put(project, "replit.mdx", "x\n");
      applyInstall(project);
      expect(existsSync(join(project, "replit.md"))).toBe(false);
    });
  });
});

describe("a pointer behind a link", () => {
  test("a symlinked replit.md is refused and its target is untouched", () => {
    inATemporaryProject("nt-pointer-link-", (project) => {
      put(project, "elsewhere.md", "theirs\n");
      symlinkSync(join(project, "elsewhere.md"), join(project, "replit.md"));
      const plan = install(project);
      expect(planRefusals(plan).map((action) => action.path)).toContain("replit.md");
      applyPlan(plan, project);
      expect(read(project, "elsewhere.md")).toBe("theirs\n");
    });
  });

  test("a symlinked .cursor/rules directory is refused and nothing lands behind it", () => {
    inATemporaryProject("nt-pointer-link-dir-", (project) => {
      mkdirSync(join(project, "outside"));
      mkdirSync(join(project, ".cursor"));
      symlinkSync(join(project, "outside"), join(project, ".cursor", "rules"));
      const plan = install(project);
      expect(planRefusals(plan).map((action) => action.path)).toContain(RULE);
      applyPlan(plan, project);
      expect(existsSync(join(project, "outside", "narrativetrace.mdc"))).toBe(false);
    });
  });

  test("uninstall never follows the link either", () => {
    inATemporaryProject("nt-pointer-link-un-", (project) => {
      mkdirSync(join(project, "outside"));
      writeFileSync(
        join(project, "outside", "narrativetrace.mdc"),
        renderCursorRule(CURSOR_RULE_TEXT, ""),
      );
      mkdirSync(join(project, ".cursor"));
      symlinkSync(join(project, "outside"), join(project, ".cursor", "rules"));
      applyUninstall(project);
      expect(existsSync(join(project, "outside", "narrativetrace.mdc"))).toBe(true);
    });
  });
});

describe("a stale section", () => {
  test("a stale CRLF section in replit.md is refreshed in CRLF around the user's text", () => {
    inATemporaryProject("nt-pointer-stale-", (project) => {
      put(project, ".replit", "x\n");
      applyInstall(project, initOptions());
      const current = read(project, "replit.md");
      const stale = current.replace(CARRIER.coordinate, "@narrativetrace/skills@0.0.1");
      put(project, "replit.md", `# Notes\r\n\r\n${crlf(stale.split("\n").slice(1).join("\n"))}`);
      applyInstall(project, initOptions());
      const after = read(project, "replit.md");
      expect(after.startsWith("# Notes\r\n\r\n")).toBe(true);
      expect(after).toContain(CARRIER.coordinate);
      expect(after).not.toContain("0.0.1");
      expect(after.replaceAll("\r\n", "")).not.toContain("\n");
    });
  });
});
