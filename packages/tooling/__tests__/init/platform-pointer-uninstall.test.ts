// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { renderAgentsMdBlock } from "../../src/init/agents-md-block.js";
import { CURSOR_FRONTMATTER, renderCursorRule } from "../../src/init/cursor-rule.js";
import { initOptions } from "../../src/init/init-options.js";
import { CREATED_NOTE } from "../../src/init/marked-block.js";
import { projectState } from "../../src/init/project-state.js";
import { planUninstall } from "../../src/init/uninstall-planner.js";
import { CURSOR_RULE_TEXT } from "../../src/platforms/platform-table.js";
import { fakeCarrier } from "./fixtures.js";

/**
 * An uninstall removes the pointers the installer wrote — whether or not the platform's marker is
 * still there — and nothing beside them. Named after `PlatformPointerUninstallTest` in the Java
 * reference so the two lists diff.
 */

const CARRIER = fakeCarrier(["a"]);
const RULE = ".cursor/rules/narrativetrace.mdc";
const REPLIT = "replit.md";
const ours = renderCursorRule(CURSOR_RULE_TEXT, CARRIER.coordinate);
const section = renderAgentsMdBlock(CARRIER, projectState());

function planFor(files: Record<string, string>, options = initOptions()) {
  return planUninstall(projectState({ pointerFiles: new Map(Object.entries(files)) }), options);
}

function actionFor(files: Record<string, string>, path: string, options = initOptions()) {
  return planFor(files, options).actions.find((action) => action.path === path);
}

describe("the Cursor rule", () => {
  test("is deleted when nothing but our section is left in it", () => {
    expect(actionFor({ [RULE]: ours }, RULE)?.kind).toBe("delete");
  });

  test("keeps anything the user added, losing only the section", () => {
    const edited = `${ours}Custom line\n`;
    const action = actionFor({ [RULE]: edited }, RULE);
    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe(`${CURSOR_FRONTMATTER}Custom line\n`);
  });

  test("keeps the user's lines above our section too", () => {
    const edited = `${CURSOR_FRONTMATTER}Mine\n\n${ours.slice(CURSOR_FRONTMATTER.length)}`;
    expect(actionFor({ [RULE]: edited }, RULE)?.after).toBe(`${CURSOR_FRONTMATTER}Mine\n`);
  });

  test("with no section of ours is left untouched: nothing at all is planned", () => {
    expect(planFor({ [RULE]: "---\n---\nmine\n" }).actions).toEqual([]);
  });

  test("with an unclosed section is refused rather than guessed at", () => {
    const unclosed = ours.replace("<!-- narrativetrace:end -->\n", "");
    expect(actionFor({ [RULE]: unclosed }, RULE)?.kind).toBe("refuse");
  });

  test("with two sections is refused", () => {
    expect(actionFor({ [RULE]: ours + ours }, RULE)?.kind).toBe("refuse");
  });

  test("a CRLF rule the installer made is still deleted", () => {
    expect(actionFor({ [RULE]: ours.replaceAll("\n", "\r\n") }, RULE)?.kind).toBe("delete");
  });

  test("a rule saved with a byte-order mark is still deleted", () => {
    expect(actionFor({ [RULE]: `﻿${ours}` }, RULE)?.kind).toBe("delete");
  });
});

describe("replit.md", () => {
  test("is deleted when the installer created it and nothing else is left", () => {
    expect(actionFor({ [REPLIT]: `${CREATED_NOTE}\n${section}` }, REPLIT)?.kind).toBe("delete");
  });

  test("keeps the user's text when the installer only appended to it", () => {
    const action = actionFor({ [REPLIT]: `# Notes\n\n${section}` }, REPLIT);
    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe("# Notes\n");
  });

  test("a created file the user wrote below is kept, minus the note and the section", () => {
    const action = actionFor({ [REPLIT]: `${CREATED_NOTE}\n${section}\nMy notes\n` }, REPLIT);
    expect(action?.after).toBe("\nMy notes\n");
  });

  test("a created file saved with a byte-order mark is still deleted", () => {
    const text = `﻿${CREATED_NOTE}\n${section}`;
    expect(actionFor({ [REPLIT]: text }, REPLIT)?.kind).toBe("delete");
  });
});

describe("scope and mixture", () => {
  test("both pointers are removed when both are present", () => {
    const plan = planFor({ [RULE]: ours, [REPLIT]: `${CREATED_NOTE}\n${section}` });
    expect(plan.actions.map((action) => action.path).sort()).toEqual([REPLIT, RULE].sort());
  });

  test("a skills-only uninstall leaves the pointers alone", () => {
    const plan = planFor({ [RULE]: ours }, initOptions({ scope: "skills" }));
    expect(plan.actions).toEqual([]);
  });

  test("a pointer behind a link is never in the snapshot, so nothing is planned for it", () => {
    const state = projectState({ pointersBehindLinks: new Set([RULE]) });
    expect(planUninstall(state).actions).toEqual([]);
  });
});

describe("the created note", () => {
  test("is read from the first line only: one the user wrote lower down is kept", () => {
    const text = `# Mine\n${CREATED_NOTE}\n\n${section}`;
    expect(actionFor({ [REPLIT]: text }, REPLIT)?.after).toBe(`# Mine\n${CREATED_NOTE}\n`);
  });
});
