// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  installedSkill,
  isLinkedPresence,
  linkedAtOf,
  SKILL_PAGE,
  type SkillPresence,
  skillDirectoryOf,
  skillPageOf,
} from "../../src/init/installed-skill.js";

/**
 * The record every decision about one skill path is a function of, and the guards that keep it from
 * contradicting itself. Its own class, because Java's adversarial pass found the same record had no
 * test of its own there and its guards were only ever reached through a planner.
 */

const EVERY_PRESENCE: readonly SkillPresence[] = [
  "ours",
  "foreign",
  "not-a-directory",
  "linked-directory",
  "linked-page",
];

describe("what is at one skill path", () => {
  test("names the two paths a skill occupies", () => {
    expect(skillDirectoryOf("agents", "a")).toBe(".agents/skills/a");
    expect(skillPageOf("claude", "a")).toBe(`.claude/skills/a/${SKILL_PAGE}`);
  });

  test("defaults everything a plain directory has nothing to say about", () => {
    const skill = installedSkill("agents", "a", "foreign");

    expect(skill.coordinate).toBe("");
    expect(skill.body).toBe("");
    expect(skill.link).toBe("");
  });

  test("is frozen, so no later stage can edit what was read", () => {
    const skill = installedSkill("agents", "a", "foreign");

    expect(() => {
      (skill as { name: string }).name = "b";
    }).toThrow(TypeError);
  });

  test.each(EVERY_PRESENCE)("refuses a blank name whatever is there (%s)", (presence) => {
    const link = isLinkedPresence(presence) ? "../elsewhere" : "";

    expect(() => installedSkill("agents", " ", presence, "c", "", link)).toThrow(
      /name must not be blank/,
    );
  });

  test("refuses an install of ours with no coordinate", () => {
    expect(() => installedSkill("agents", "a", "ours")).toThrow(/carries its coordinate/);
  });

  test.each([
    "linked-directory",
    "linked-page",
  ] as const)("refuses %s without naming what the link points at", (presence) => {
    expect(() => installedSkill("agents", "a", presence)).toThrow(/a linked presence names/);
    expect(() => installedSkill("agents", "a", presence, "", "", "   ")).toThrow(
      /a linked presence names/,
    );
  });

  test.each([
    "ours",
    "foreign",
    "not-a-directory",
  ] as const)("refuses a link named on %s, which nothing links to", (presence) => {
    expect(() => installedSkill("agents", "a", presence, "c", "", "../elsewhere")).toThrow(
      /only a linked one does/,
    );
  });

  test("says which presences the installer must not write through", () => {
    expect(EVERY_PRESENCE.filter(isLinkedPresence)).toEqual(["linked-directory", "linked-page"]);
  });

  test("puts the link where the filesystem has it", () => {
    const directory = installedSkill("claude", "a", "linked-directory", "", "", "../x");
    const page = installedSkill("claude", "a", "linked-page", "", "", "../x");

    expect(linkedAtOf(directory)).toBe(".claude/skills/a");
    expect(linkedAtOf(page)).toBe(`.claude/skills/a/${SKILL_PAGE}`);
  });

  test.each([
    "ours",
    "foreign",
    "not-a-directory",
  ] as const)("refuses to say where a link is when %s is what is there", (presence) => {
    const skill = installedSkill("agents", "a", presence, "c");

    expect(() => linkedAtOf(skill)).toThrow("nothing links to .agents/skills/a");
  });
});
