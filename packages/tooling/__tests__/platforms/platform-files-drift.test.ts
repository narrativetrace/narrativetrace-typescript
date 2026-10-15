// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderCursorRule } from "../../src/init/cursor-rule.js";
import { CURSOR_RULE_TEXT, platformRowById } from "../../src/platforms/platform-table.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "../repo-root.js";

/**
 * Every repository file that is a view of the platform table equals a fresh render of it. The writer
 * is `pnpm run skills-render`; never hand-edit a file this test names.
 */
const CURSOR_RULE = ".cursor/rules/narrativetrace.mdc";

describe.skipIf(!REPO_ROOT_REACHABLE)("the files the platform table renders into", () => {
  test("the Cursor rule the plugin ships is the table row's pointer with no stamp", () => {
    const onDisk = readFileSync(join(REPO_ROOT, CURSOR_RULE), "utf-8");
    expect(onDisk).toBe(renderCursorRule(CURSOR_RULE_TEXT, ""));
  });

  test("the Cursor plugin manifest points at the rule file the table names", () => {
    const plugin = readFileSync(join(REPO_ROOT, ".cursor-plugin/plugin.json"), "utf-8");
    expect(plugin).toContain(`"rules": "./${CURSOR_RULE}"`);
    expect(platformRowById("cursor")?.pointer.path).toBe(CURSOR_RULE);
  });
});
