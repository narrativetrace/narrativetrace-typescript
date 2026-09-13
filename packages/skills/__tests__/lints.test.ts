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
import type { ProListing } from "../src/pro-listing.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import type { Skill } from "../src/skill.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "./repo-root.js";

// Synthetic-fixture unit tests below, independent of REPO_ROOT: the "no planning-note citation"
// describe block further down skips entirely under Stryker's package-only sandbox (REPO_ROOT is
// not reachable there — see repo-root.ts), which left citationViolations/proseOf and
// listingsDisagreeingWithFeatureGuide almost completely uncovered by mutation testing. These run
// unconditionally, in every environment.

const MINIMAL_SKILL: Skill = {
  canonicalName: "example-skill",
  claudeSegment: "example",
  skillClass: "mechanical",
  description: "An example skill.",
  fixture: "examples/sixty-seconds",
  allowedTools: ["pnpm", "node"],
  steps: [],
  always: [],
  never: [],
};

describe("catalogueDescriptionChars", () => {
  it("sums every skill's description length exactly", () => {
    const skills: Skill[] = [
      { ...MINIMAL_SKILL, description: "abc" },
      { ...MINIMAL_SKILL, description: "de" },
    ];
    expect(catalogueDescriptionChars(skills)).toBe(5);
  });

  it("is zero for an empty catalogue", () => {
    expect(catalogueDescriptionChars([])).toBe(0);
  });
});

describe("unparseableCommands", () => {
  it("is empty when every command has a real first token", () => {
    const skill: Skill = {
      ...MINIMAL_SKILL,
      steps: [{ title: "run it", body: { kind: "commands", commands: ["pnpm test"] } }],
    };
    expect(unparseableCommands([skill])).toEqual([]);
  });

  it("names the skill and the offending (quoted) command for a whitespace-only command", () => {
    const skill: Skill = {
      ...MINIMAL_SKILL,
      steps: [{ title: "run it", body: { kind: "commands", commands: ["   "] } }],
    };
    expect(unparseableCommands([skill])).toEqual(["example-skill: '   '"]);
  });
});

describe("listingsDisagreeingWithFeatureGuide", () => {
  const listing: ProListing = {
    canonicalName: "narrativetrace-mcp",
    prompt: "ask for trace data as a tool call",
    delivers: "an MCP server",
    needs: "a Pro license",
    comesFrom: "the Java Pro line",
    status: "in development",
    featureGuideStatusText: "In development (Pro)",
  };

  it("is empty when the listing's status text appears verbatim in the feature guide", () => {
    const guide = "| narrativetrace-mcp | In development (Pro) |";
    expect(listingsDisagreeingWithFeatureGuide([listing], guide)).toEqual([]);
  });

  it("names the listing when its status text is missing from the feature guide", () => {
    const guide = "| narrativetrace-mcp | Shipped |";
    expect(listingsDisagreeingWithFeatureGuide([listing], guide)).toEqual(["narrativetrace-mcp"]);
  });
});

describe("citationViolations (synthetic fixtures)", () => {
  it("is empty for a skill with no section-mark and no .md filename anywhere", () => {
    const skill: Skill = { ...MINIMAL_SKILL, description: "Does a thing, cleanly." };
    expect(citationViolations(skill)).toEqual([]);
  });

  it("flags a § section-mark citation in the description", () => {
    const skill: Skill = { ...MINIMAL_SKILL, description: "See skill-design.md §2 for context." };
    const violations = citationViolations(skill);
    expect(violations).toContain(
      'example-skill: section-mark citation in "See skill-design.md §2 for context."',
    );
  });

  it("flags a .md filename that is not in the provided repo listing", () => {
    const skill: Skill = { ...MINIMAL_SKILL, description: "See private-notes.md for context." };
    const violations = citationViolations(skill, new Set(["readme.md"]));
    expect(violations).toContain(
      'example-skill: external filename citation "private-notes.md" in "See private-notes.md for context."',
    );
  });

  it("recognizes a two-letter .md basename, not only ones a single-char match would still catch", () => {
    const skill: Skill = { ...MINIMAL_SKILL, description: "See ci.md for context." };
    const violations = citationViolations(skill, new Set());
    expect(violations.some((v) => v.includes('"ci.md"'))).toBe(true);
  });

  it("does not flag a .md filename that IS in the provided repo listing, case-insensitively", () => {
    const skill: Skill = { ...MINIMAL_SKILL, description: "See README.md for context." };
    expect(citationViolations(skill, new Set(["readme.md"]))).toEqual([]);
  });

  it("checks whenToUse prose, not just description", () => {
    const skill: Skill = { ...MINIMAL_SKILL, whenToUse: "Use it when reading skill-design.md §2." };
    expect(citationViolations(skill).length).toBeGreaterThan(0);
  });

  it("checks a step's title, flag, verify, and commands", () => {
    const withStep = (overrides: Partial<Skill["steps"][number]>): Skill => ({
      ...MINIMAL_SKILL,
      description: "clean",
      steps: [
        { title: "clean title", body: { kind: "commands", commands: ["pnpm test"] }, ...overrides },
      ],
    });
    expect(
      citationViolations(withStep({ title: "See skill-design.md §2" })).length,
    ).toBeGreaterThan(0);
    expect(citationViolations(withStep({ flag: "skill-design.md §2" })).length).toBeGreaterThan(0);
    expect(citationViolations(withStep({ verify: "skill-design.md §2" })).length).toBeGreaterThan(
      0,
    );
    expect(
      citationViolations(
        withStep({ body: { kind: "commands", commands: ["echo skill-design.md §2"] } }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("does not scan a snippet step's body — only commands-step bodies are prose", () => {
    const skill: Skill = {
      ...MINIMAL_SKILL,
      description: "clean",
      steps: [
        {
          title: "clean title",
          body: { kind: "snippet", path: "skill-design.md", language: "md" },
        },
      ],
    };
    // The snippet step's own path is not prose the lint scans — only its rendered file content
    // (real source), which citationViolations never sees.
    expect(citationViolations(skill)).toEqual([]);
  });

  it("checks failure notes: symptom, cause, and fix", () => {
    const base = (failure: Skill["steps"][number]["failure"]): Skill => ({
      ...MINIMAL_SKILL,
      description: "clean",
      steps: [
        {
          title: "clean title",
          body: { kind: "commands", commands: ["pnpm test"] },
          failure,
        },
      ],
    });
    expect(
      citationViolations(base([{ symptom: "skill-design.md §2", cause: "x", fix: "y" }])).length,
    ).toBeGreaterThan(0);
    expect(
      citationViolations(base([{ symptom: "x", cause: "skill-design.md §2", fix: "y" }])).length,
    ).toBeGreaterThan(0);
    expect(
      citationViolations(base([{ symptom: "x", cause: "y", fix: "skill-design.md §2" }])).length,
    ).toBeGreaterThan(0);
  });

  it("checks always and never rules: the rule text and the reason", () => {
    const skill: Skill = {
      ...MINIMAL_SKILL,
      description: "clean",
      always: [{ rule: "skill-design.md §2", reason: "clean" }],
      never: [{ rule: "clean", reason: "skill-design.md §2" }],
    };
    expect(citationViolations(skill).length).toBeGreaterThan(0);
  });

  it("never checks canonicalName itself for a citation", () => {
    const skill: Skill = {
      ...MINIMAL_SKILL,
      canonicalName: "skill-design.md",
      description: "clean",
    };
    expect(citationViolations(skill)).toEqual([]);
  });
});

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
