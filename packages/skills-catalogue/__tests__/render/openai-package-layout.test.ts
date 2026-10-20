// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { OPENAI_DIRECTORY, SKILLS } from "../../src/catalogue-index.js";
import { openAiPackageEntries } from "../../src/render/openai-package-layout.js";
import type { Skill } from "../../src/skill.js";

describe("openAiPackageEntries", () => {
  it("lists the manifest, one page per catalogue skill, and the two assets", () => {
    const entries = openAiPackageEntries(SKILLS, OPENAI_DIRECTORY);
    expect(entries).toContain("plugin.json");
    expect(entries).toContain("assets/logo.png");
    expect(entries).toContain("assets/composer-icon.png");
    for (const skill of SKILLS) {
      expect(entries).toContain(`skills/${skill.canonicalName}/SKILL.md`);
    }
    expect(entries).toHaveLength(SKILLS.length + 3);
  });

  it("is sorted", () => {
    const entries = openAiPackageEntries(SKILLS, OPENAI_DIRECTORY);
    expect(entries).toEqual([...entries].sort());
  });

  it("still carries the manifest and the assets for an empty skill list", () => {
    expect(openAiPackageEntries([], OPENAI_DIRECTORY)).toEqual([
      "assets/composer-icon.png",
      "assets/logo.png",
      "plugin.json",
    ]);
  });

  it("derives its asset entries from the manifest's own paths", () => {
    const manifestPaths = ["assets/logo.png", "assets/composer-icon.png"];
    expect(openAiPackageEntries([], OPENAI_DIRECTORY)).toEqual(
      expect.arrayContaining(manifestPaths),
    );
  });

  it("refuses two skills with the same canonical name", () => {
    const first = SKILLS[0] as Skill;
    expect(() => openAiPackageEntries([first, first], OPENAI_DIRECTORY)).toThrow(/duplicate/);
  });

  it("refuses a missing listing", () => {
    expect(() => openAiPackageEntries(SKILLS, undefined as never)).toThrow(TypeError);
  });
});
