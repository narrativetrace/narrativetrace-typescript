// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { Action } from "../../src/init/action.js";
import { renderAgentsMdBlock } from "../../src/init/agents-md-block.js";
import { renderCursorRule } from "../../src/init/cursor-rule.js";
import { initOptions } from "../../src/init/init-options.js";
import { planInstall } from "../../src/init/init-planner.js";
import { CREATED_NOTE } from "../../src/init/marked-block.js";
import { type ProjectState, projectState } from "../../src/init/project-state.js";
import { CURSOR_RULE_TEXT } from "../../src/platforms/platform-table.js";
import { fakeCarrier } from "./fixtures.js";

/**
 * The platform pointers (Phase 8 D2): written only on a marker, adopted when identical, refused when
 * foreign or linked. Pure planner cases, no disk. Named after `PlatformPointerPlannerTest` in the
 * Java reference so the two lists diff.
 */

const CARRIER = fakeCarrier(["a"]);
const RULE = ".cursor/rules/narrativetrace.mdc";
const REPLIT = "replit.md";
const SKILLS_ONLY = initOptions({ scope: "skills" });

function onPlatforms(
  ids: string[],
  extra: Partial<Parameters<typeof projectState>[0]> = {},
): ProjectState {
  return projectState({ detectedPlatforms: new Set(ids), ...extra });
}

function actionFor(state: ProjectState, path: string, options = initOptions()): Action | undefined {
  return planInstall(state, CARRIER, options).actions.find((action) => action.path === path);
}

function section(state: ProjectState): string {
  return renderAgentsMdBlock(CARRIER, state);
}

function pointerPaths(state: ProjectState, options = initOptions()): string[] {
  return planInstall(state, CARRIER, options)
    .actions.map((action) => action.path)
    .filter((path) => path === RULE || path === REPLIT);
}

describe("when a pointer is written", () => {
  test("a project on no platform gets no pointer", () => {
    expect(pointerPaths(projectState())).toEqual([]);
  });

  test("platforms that read the open standard directly get none", () => {
    expect(pointerPaths(onPlatforms(["antigravity", "github-copilot", "claude-code"]))).toEqual([]);
  });

  test("a skills-only run writes no pointer", () => {
    expect(pointerPaths(onPlatforms(["cursor", "replit"]), SKILLS_ONLY)).toEqual([]);
  });

  test("both pointers are planned when two markers are present at once", () => {
    expect(pointerPaths(onPlatforms(["cursor", "replit"]))).toEqual([RULE, REPLIT]);
  });
});

describe("Replit's replit.md", () => {
  test("is created with the managed section and the created note", () => {
    const state = onPlatforms(["replit"]);
    const action = actionFor(state, REPLIT);
    expect(action?.kind).toBe("create");
    expect(action?.after).toBe(`${CREATED_NOTE}\n${section(state)}`);
  });

  test("an existing one is refused without the permission flag, naming it", () => {
    const state = onPlatforms(["replit"], { pointerFiles: new Map([[REPLIT, "# Notes\n"]]) });
    const action = actionFor(state, REPLIT);
    expect(action?.kind).toBe("refuse");
    expect(action?.reason).toContain("--write-existing");
  });

  test("an existing one gets the section appended when allowed", () => {
    const state = onPlatforms(["replit"], { pointerFiles: new Map([[REPLIT, "# Notes\n"]]) });
    const action = actionFor(state, REPLIT, initOptions({ writeExisting: true }));
    expect(action?.kind).toBe("append");
    expect(action?.after).toBe(`# Notes\n\n${section(state)}`);
  });

  test("a current one is left alone and a stale one is refreshed around the user's text", () => {
    const current = onPlatforms(["replit"], {
      pointerFiles: new Map([[REPLIT, `# Notes\n\n${section(projectState())}`]]),
    });
    expect(actionFor(current, REPLIT)).toBeUndefined();
    const old = renderAgentsMdBlock(
      fakeCarrier(["a"], "@narrativetrace/skills@0.0.1"),
      projectState(),
    );
    const stale = onPlatforms(["replit"], {
      pointerFiles: new Map([[REPLIT, `# Notes\n\n${old}`]]),
    });
    expect(actionFor(stale, REPLIT)?.after).toBe(`# Notes\n\n${section(stale)}`);
  });

  test("a byte-order mark on line 1 survives a refresh of a section that starts there", () => {
    const old = renderAgentsMdBlock(
      fakeCarrier(["a"], "@narrativetrace/skills@0.0.1"),
      projectState(),
    );
    const state = onPlatforms(["replit"], { pointerFiles: new Map([[REPLIT, `﻿${old}`]]) });
    expect(actionFor(state, REPLIT)?.after).toBe(`﻿${section(state)}`);
  });

  test("a file with two sections is refused and named", () => {
    const twice = `${section(projectState())}\n${section(projectState())}`;
    const state = onPlatforms(["replit"], { pointerFiles: new Map([[REPLIT, twice]]) });
    expect(actionFor(state, REPLIT)?.kind).toBe("refuse");
  });
});

describe("Cursor's rule", () => {
  const wanted = renderCursorRule(CURSOR_RULE_TEXT, CARRIER.coordinate);

  test("is created when the .cursor directory is there", () => {
    const action = actionFor(onPlatforms(["cursor"]), RULE);
    expect(action?.kind).toBe("create");
    expect(action?.after).toBe(wanted);
  });

  test("is one rule, never a copy of a skill page", () => {
    const after = actionFor(onPlatforms(["cursor"]), RULE)?.after ?? "";
    expect(after).toContain(".agents/skills");
    expect(after).not.toContain("# a (agents)");
    expect(after.startsWith("---\n")).toBe(true);
  });

  test("a current one is left alone and a stale one is refreshed", () => {
    const current = onPlatforms(["cursor"], { pointerFiles: new Map([[RULE, wanted]]) });
    expect(actionFor(current, RULE)).toBeUndefined();
    const old = renderCursorRule(CURSOR_RULE_TEXT, "@narrativetrace/skills@0.0.1");
    const stale = onPlatforms(["cursor"], { pointerFiles: new Map([[RULE, old]]) });
    const action = actionFor(stale, RULE);
    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe(wanted);
  });

  test("the unstamped rule the plugin ships is adopted without --force", () => {
    const shipped = renderCursorRule(CURSOR_RULE_TEXT, "");
    const state = onPlatforms(["cursor"], { pointerFiles: new Map([[RULE, shipped]]) });
    const action = actionFor(state, RULE);
    expect(action?.kind).toBe("adopt");
    expect(action?.after).toBe(wanted);
  });

  test("a rule somebody else wrote at our path is refused", () => {
    const state = onPlatforms(["cursor"], { pointerFiles: new Map([[RULE, "---\n---\nmine\n"]]) });
    const action = actionFor(state, RULE, initOptions({ force: true, writeExisting: true }));
    expect(action?.kind).toBe("refuse");
    expect(action?.reason).toContain("not written by narrativetrace");
  });

  test("a rule with two sections is refused and left alone", () => {
    const twice = `${wanted}\n${wanted}`;
    const state = onPlatforms(["cursor"], { pointerFiles: new Map([[RULE, twice]]) });
    expect(actionFor(state, RULE)?.kind).toBe("refuse");
  });

  test("a CRLF rule that is already current plans nothing", () => {
    const crlf = wanted.replaceAll("\n", "\r\n");
    const state = onPlatforms(["cursor"], { pointerFiles: new Map([[RULE, crlf]]) });
    expect(actionFor(state, RULE)).toBeUndefined();
  });
});

describe("a pointer behind a symbolic link", () => {
  test("is refused, for every pointer kind", () => {
    const state = onPlatforms(["cursor", "replit"], {
      pointersBehindLinks: new Set([RULE, REPLIT]),
    });
    for (const path of [RULE, REPLIT]) {
      const action = actionFor(state, path);
      expect(action?.kind).toBe("refuse");
      expect(action?.reason).toContain("symbolic link");
    }
  });
});

describe("a pointer path the installer cannot plan against", () => {
  test("is refused at the path that blocks it, with the reason, and nothing is created", () => {
    const state = onPlatforms(["cursor"], {
      pointersUnwritable: new Map([[RULE, { at: ".cursor", why: ".cursor is not a directory" }]]),
    });
    const action = actionFor(state, ".cursor");
    expect(action?.kind).toBe("refuse");
    expect(action?.reason).toBe(".cursor is not a directory — nothing is planned over it");
    expect(actionFor(state, RULE)).toBeUndefined();
  });
});
