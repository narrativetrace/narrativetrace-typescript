// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { PRO_LISTINGS, SKILLS } from "../src/catalogue-index.js";
import {
  CATALOGUE_CHAR_BUDGET,
  catalogueDescriptionChars,
  catalogueVocabularyViolations,
  citationViolations,
  descriptionFitsBudget,
  listingsDisagreeingWithFeatureGuide,
  stepsWithoutVerify,
  unparseableCommands,
} from "../src/lints.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import type { Skill } from "../src/skill.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "./repo-root.js";

// Tier A (skill-harness-design.md §4.1): schema/vocabulary/budget/index-agreement lints. No LLM,
// seconds, per commit — rides `pnpm run coverage` like every other package's own test suite.

/** Steps a skill's OWN design has explicitly flagged as not carrying a mechanical verify. */
const JUDGMENTAL_STEP_TITLES = new Set([
  "Read the rendered trace before asserting",
  "Approval flow: diff the structural trace, not just values",
]);

describe("catalogue index", () => {
  it("is non-empty", () => {
    expect(SKILLS.length).toBeGreaterThan(0);
  });

  it("has no duplicate canonical names", () => {
    const names = SKILLS.map((s) => s.canonicalName);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(SKILLS)("$canonicalName: description fits the per-skill budget", (skill) => {
    expect(descriptionFitsBudget(skill)).toBe(true);
  });

  it("catalogue-wide description budget stays under the silent-drop cliff", () => {
    expect(catalogueDescriptionChars(SKILLS)).toBeLessThan(CATALOGUE_CHAR_BUDGET);
  });

  it("every commands string parses to a non-empty first token", () => {
    expect(unparseableCommands(SKILLS)).toEqual([]);
  });

  it("every commands string's first token is in the closed vocabulary", () => {
    expect(catalogueVocabularyViolations(SKILLS)).toEqual([]);
  });

  it.each(SKILLS)("$canonicalName: every non-judgmental step carries a verify", (skill) => {
    const missing = stepsWithoutVerify(skill).filter((title) => !JUDGMENTAL_STEP_TITLES.has(title));
    expect(missing).toEqual([]);
  });

  it.each(
    SKILLS,
  )("$canonicalName: an unstudied step is flagged, not silently unverified", (skill) => {
    for (const step of skill.steps) {
      if (step.verify === undefined && !JUDGMENTAL_STEP_TITLES.has(step.title)) {
        expect(step.flag, `${step.title} has neither verify nor flag`).toBeDefined();
      }
    }
  });

  it.each(SKILLS)("$canonicalName: every always/never rule carries a reason", (skill) => {
    for (const rule of [...skill.always, ...skill.never]) {
      expect(rule.reason.length).toBeGreaterThan(0);
    }
  });
});

// Every `.md` file actually present in the repository, lowercased basename only — the same shape
// `citationViolations` compares a rendered skill's filename mentions against.
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".stryker-tmp",
  ".turbo",
]);
function repoMarkdownBasenames(root: string): ReadonlySet<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !SKIPPED_DIRS.has(entry.name))
          walk(join(dir, entry.name));
      } else if (entry.name.toLowerCase().endsWith(".md")) {
        names.add(entry.name.toLowerCase());
      }
    }
  };
  walk(root);
  return names;
}

describe.skipIf(!REPO_ROOT_REACHABLE)(
  "no planning-note citation survives into rendered skill text",
  () => {
    const basenames = repoMarkdownBasenames(REPO_ROOT);

    it.each(SKILLS)("$canonicalName", (skill) => {
      expect(citationViolations(skill, basenames)).toEqual([]);
    });

    it("still flags a '§' mark and a filename this repo does not carry (lint sanity)", () => {
      const base = SKILLS[0] as Skill;
      const skill: Skill = {
        ...base,
        description: `See agent-skills-2026-09-12.md §7 ruling 3. ${base.description}`,
      };
      const violations = citationViolations(skill, basenames);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.includes("§"))).toBe(true);
      expect(violations.some((v) => v.includes("agent-skills-2026-09-12.md"))).toBe(true);
    });
  },
);

// A plain `if`, not `describe.skipIf`: the feature guide is read directly in the describe body
// (below the `it`s), which `skipIf` would not stop from running during collection under the
// sandbox this guards against.
if (REPO_ROOT_REACHABLE) {
  describe("Pro listings agree with the feature guide", () => {
    const featureGuide = readFileSync(
      join(REPO_ROOT, "documentation", "feature-guide.md"),
      "utf-8",
    );

    it("has at least one listing", () => {
      expect(PRO_LISTINGS.length).toBeGreaterThan(0);
    });

    it("every listing's status text still appears in the feature guide", () => {
      expect(listingsDisagreeingWithFeatureGuide(PRO_LISTINGS, featureGuide)).toEqual([]);
    });
  });
}

describe.skipIf(!REPO_ROOT_REACHABLE)(
  "rendered SKILL.md matches the typed catalogue (build-step drift check)",
  () => {
    test.each(SKILLS)("$canonicalName", async (skill) => {
      // Dynamic, not a top-level import: a top-level `tools/snippet-shared.js` import would be
      // resolved when this FILE loads, regardless of skipIf — including inside Stryker's
      // package-only sandbox (see REPO_ROOT_REACHABLE's own comment), where `tools/`, a
      // repo-root-only directory, is simply not there. Deferred to inside the one test body that
      // actually needs it, so a skipped run never attempts the resolution at all.
      const { stripLicenseHeader } = await import("../../../tools/snippet-shared.js");
      const path = join(REPO_ROOT, ".claude", "skills", skill.claudeSegment, "SKILL.md");
      const resolveSnippet = (p: string) =>
        stripLicenseHeader(readFileSync(join(REPO_ROOT, p), "utf-8")).replace(/\n$/, "");
      const expected = `${renderClaudeSkill(skill, resolveSnippet)}\n`;
      expect(readFileSync(path, "utf-8")).toBe(expected);
    });
  },
);
