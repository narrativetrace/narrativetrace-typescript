// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { CURSOR_FRONTMATTER, renderCursorRule } from "../../src/init/cursor-rule.js";
import { MARKER_END, MARKER_START, scanMarkedBlocks } from "../../src/init/marked-block.js";

describe("the Cursor rule file", () => {
  test("is the frontmatter, then one stamped managed section carrying the text", () => {
    const rule = renderCursorRule("Read the skills.", "@narrativetrace/skills@1.2.3");
    expect(rule).toBe(
      `${CURSOR_FRONTMATTER}${MARKER_START} @narrativetrace/skills@1.2.3 -->\nRead the skills.\n${MARKER_END}\n`,
    );
    expect(scanMarkedBlocks(rule).regions).toHaveLength(1);
  });

  test("always applies, because the pointer must be seen every turn", () => {
    expect(CURSOR_FRONTMATTER).toContain("alwaysApply: true");
    expect(CURSOR_FRONTMATTER.startsWith("---\n")).toBe(true);
  });

  test("with no coordinate the opening marker carries no stamp", () => {
    const rule = renderCursorRule("Text.", "");
    expect(rule).toContain(`${MARKER_START} -->\n`);
    expect(scanMarkedBlocks(rule).regions[0]?.coordinate).toBe("");
  });

  test("refuses blank text, absent text and a missing coordinate, saying what a rule needs", () => {
    expect(() => renderCursorRule(" ", "")).toThrow(/a rule needs its text and a coordinate/);
    expect(() => renderCursorRule(undefined as never, "")).toThrow(TypeError);
    expect(() => renderCursorRule("x", undefined as never)).toThrow(/a rule needs/);
  });

  test("refuses text that would swallow the end marker, saying the rule must be one region", () => {
    expect(() => renderCursorRule("```", "@x@1")).toThrow(/exactly one managed region/);
  });
});
