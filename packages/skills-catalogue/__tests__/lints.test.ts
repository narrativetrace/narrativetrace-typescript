// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { BODY_PATH, DRAFT_PATH } from "../src/catalogue/feedback-commands.js";
import { findSkill, MARKETPLACE, PRO_LISTINGS, SKILLS } from "../src/catalogue-index.js";
import {
  CATALOGUE_CHAR_BUDGET,
  catalogueAllowedToolsViolations,
  catalogueDescriptionChars,
  catalogueVocabularyViolations,
  citationViolations,
  descriptionFitsBudget,
  listingsDisagreeingWithFeatureGuide,
  promotionNotPreApproved,
  publishingNotPreApproved,
  stepsWithoutVerify,
  unparseableCommands,
} from "../src/lints.js";
import type { ProListing } from "../src/pro-listing.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { renderMarketplaceJson } from "../src/render/marketplace-json.js";
import type { Skill } from "../src/skill.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "./repo-root.js";

// Synthetic-fixture unit tests below, independent of REPO_ROOT: the "no planning-note citation"
// describe block further down skips entirely under Stryker's package-only sandbox (REPO_ROOT is
// not reachable there — see repo-root.ts), which left citationViolations/proseOf and
// listingsDisagreeingWithFeatureGuide almost completely uncovered by mutation testing. These run
// unconditionally, in every environment.

const MINIMAL_SKILL: Skill = {
  canonicalName: "example-skill",
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

  it("checks a step's title, flag, condition, verify, and commands", () => {
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
    expect(
      citationViolations(withStep({ condition: "skill-design.md §2" })).length,
    ).toBeGreaterThan(0);
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
  "Show the whole draft, not a summary of it",
  "Ask once whether to file it, then stop the turn",
  "Print the way to file it, and nothing else",
  "Explain the scores, notes and what they do not show",
  // narrativetrace-verify: a decision, an intent, readings against it, the pin's gate and a report
  // are judged on the reply, not by a command's exit code.
  "Decide whether to trace, and say so",
  "Write the intent down before running anything",
  "Read the structural trace first, against the intent",
  "Open values on the span that looks wrong, and only there",
  "Fix, re-run, read again",
  "Turn approval mode on",
  "Run the suite in approval mode and show every .received.nt",
  "Ask once whether to pin it, then stop the turn",
  "Promote what was shown, and nothing else",
  "Report what the trace showed",
  // narrativetrace-debug: reading, naming a span, a hand-off, a fix judged by the same span, a
  // delta read line by line, a kept test and a report — each judged on the reply.
  "Find the symptom in the values",
  "Across async work, read the sequence diagram first",
  "Localize by reading: name the first span where a value diverges",
  "Bisect by span, not by file",
  "Hand a defect in NarrativeTrace itself to narrativetrace-feedback",
  "Fix it in the diverging span, re-run the same input, read the same span",
  "Check that nothing else moved",
  "Keep the reproduction as the regression test",
  "Report the root cause as the trace showed it",
]);

const REPORTING_COMMAND = "npx @narrativetrace/cli feedback url --category library";

function reportingSkill(allowedTools: readonly string[], command = REPORTING_COMMAND): Skill {
  return {
    ...MINIMAL_SKILL,
    canonicalName: "narrativetrace-x",
    allowedTools,
    steps: [{ title: "report it", body: { kind: "commands", commands: [command] } }],
  };
}

describe("publishingNotPreApproved (synthetic fixtures)", () => {
  it("rejects a skill that pre-approves its own reporting command", () => {
    const [violation, ...rest] = publishingNotPreApproved([reportingSkill(["npx"])]);
    expect(rest).toEqual([]);
    expect(violation).toBe(
      `narrativetrace-x: declares allowed tool "npx", which pre-approves its own publishing command "${REPORTING_COMMAND}" — a skill that files something public must let the harness ask`,
    );
  });

  it("accepts the same skill declaring no allowed tool", () => {
    expect(publishingNotPreApproved([reportingSkill([])])).toEqual([]);
  });

  it("accepts a skill whose allowed tools do not match the reporting command's first token", () => {
    expect(publishingNotPreApproved([reportingSkill(["pnpm", "node"])])).toEqual([]);
  });

  it("ignores a skill whose commands publish nothing, however much it pre-approves", () => {
    const skill = reportingSkill(["npx"], "npx @narrativetrace/cli doctor --json");
    expect(publishingNotPreApproved([skill])).toEqual([]);
  });

  it("does not take a word that merely contains the verb for the verb", () => {
    const skill = reportingSkill(["npx"], "npx some-tool --feedbackless");
    expect(publishingNotPreApproved([skill])).toEqual([]);
  });

  it("does not take a quoted or path-embedded word for the verb", () => {
    const quoted = reportingSkill(["node"], "node -e \"x.includes('feedback')\"");
    const path = reportingSkill(["node"], "node -e \"read('out/feedback/draft.md')\"");
    expect(publishingNotPreApproved([quoted, path])).toEqual([]);
  });

  it("takes the verb at the very end of a command", () => {
    expect(publishingNotPreApproved([reportingSkill(["npx"], "npx cli feedback")])).toHaveLength(1);
  });

  it("reports every pre-approved publishing command across the skills it is given", () => {
    const skills = [reportingSkill(["npx"]), reportingSkill(["npx", "node"]), reportingSkill([])];
    expect(publishingNotPreApproved(skills)).toHaveLength(2);
  });
});

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

  it("every declared allowed tool is a bare command of the closed vocabulary", () => {
    expect(catalogueAllowedToolsViolations(SKILLS)).toEqual([]);
  });

  it("no skill pre-approves a command that files something public", () => {
    expect(publishingNotPreApproved(SKILLS)).toEqual([]);
  });

  it("narrativetrace-feedback is in the catalogue", () => {
    expect(findSkill("narrativetrace-feedback")?.allowedTools).toEqual([]);
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
    // The report files the verb writes are real names a rendered page must be allowed to say, but
    // they exist only under a gitignored output directory: a clean checkout has no such file, so
    // listing the repository alone made this lint pass or fail on whether a replay had run first.
    const basenames = new Set([
      ...repoMarkdownBasenames(REPO_ROOT),
      ...[DRAFT_PATH, BODY_PATH].map((path) => basename(path).toLowerCase()),
    ]);

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
    // Dynamic, not a top-level import: a top-level `tools/snippet-shared.js` import would be
    // resolved when this FILE loads, regardless of skipIf — including inside Stryker's
    // package-only sandbox (see REPO_ROOT_REACHABLE's own comment), where `tools/`, a
    // repo-root-only directory, is simply not there. Deferred to inside the one test body that
    // actually needs it, so a skipped run never attempts the resolution at all.
    async function resolveSnippetFromRepo(): Promise<(p: string) => string> {
      const { stripLicenseHeader } = await import("../../../tools/snippet-shared.js");
      return (p: string) =>
        stripLicenseHeader(readFileSync(join(REPO_ROOT, p), "utf-8")).replace(/\n$/, "");
    }

    test.each(SKILLS)("$canonicalName (Claude)", async (skill) => {
      const resolveSnippet = await resolveSnippetFromRepo();
      const path = join(REPO_ROOT, ".claude", "skills", skill.canonicalName, "SKILL.md");
      const expected = `${renderClaudeSkill(skill, resolveSnippet)}\n`;
      expect(readFileSync(path, "utf-8")).toBe(expected);
    });

    test.each(SKILLS)("$canonicalName (Codex .agents/skills)", async (skill) => {
      const resolveSnippet = await resolveSnippetFromRepo();
      const path = join(REPO_ROOT, ".agents", "skills", skill.canonicalName, "SKILL.md");
      const expected = `${renderAgentsSkill(skill, resolveSnippet)}\n`;
      expect(readFileSync(path, "utf-8")).toBe(expected);
    });

    it("marketplace.json", () => {
      const path = join(REPO_ROOT, ".claude-plugin", "marketplace.json");
      expect(readFileSync(path, "utf-8")).toBe(renderMarketplaceJson(MARKETPLACE));
    });

    it("the plugin source directory holds every skill page the catalogue declares", () => {
      const pluginRoot = join(REPO_ROOT, MARKETPLACE.pluginSource);
      for (const skill of SKILLS) {
        const page = join(pluginRoot, "skills", skill.canonicalName, "SKILL.md");
        expect(
          existsSync(page),
          `${skill.canonicalName}'s page must live under the plugin source`,
        ).toBe(true);
      }
    });
  },
);

describe("citationViolations reads a skill's reference sections too", () => {
  it("names a section-mark citation inside a reference section", () => {
    const skill: Skill = {
      canonicalName: "s",
      skillClass: "guided",
      description: "d",
      fixture: "examples/sixty-seconds",
      steps: [],
      always: [],
      never: [],
      allowedTools: [],
      references: [{ heading: "Reading", markdown: "see design §4" }],
    };
    expect(citationViolations(skill)).toEqual(['s: section-mark citation in "see design §4"']);
  });
});

describe("promotionNotPreApproved — a skill that pins a baseline lets the harness ask", () => {
  const pinning = (allowedTools: readonly string[]): Skill => ({
    canonicalName: "pinner",
    skillClass: "guided",
    description: "d",
    fixture: "examples/sixty-seconds",
    steps: [
      { title: "Promote", body: { kind: "commands", commands: ["npx narrativetrace-approve"] } },
    ],
    always: [],
    never: [],
    allowedTools,
  });

  it("passes a promoting skill that declares no allowed tool", () => {
    expect(promotionNotPreApproved([pinning([])])).toEqual([]);
  });

  it.each([
    ["npx"],
    ["Bash(npx narrativetrace-approve)"],
    ["pnpm"],
    ["node"],
  ])("fails a promoting skill that declares %s — any tool could reach the promotion", (tool) => {
    expect(promotionNotPreApproved([pinning([tool])])).toHaveLength(1);
    expect(promotionNotPreApproved([pinning([tool])])[0]).toContain("pinner");
  });

  it("names the package-script spelling of the promotion too", () => {
    const skill = {
      ...pinning(["pnpm"]),
      steps: [
        {
          title: "P",
          body: { kind: "commands" as const, commands: ["pnpm run approve-narratives"] },
        },
      ],
    };
    expect(promotionNotPreApproved([skill])).toHaveLength(1);
  });

  it("ignores a skill that promotes nothing", () => {
    const skill = {
      ...pinning(["pnpm"]),
      steps: [{ title: "T", body: { kind: "commands" as const, commands: ["pnpm test"] } }],
    };
    expect(promotionNotPreApproved([skill])).toEqual([]);
  });

  it("holds for the whole catalogue", () => {
    expect(promotionNotPreApproved(SKILLS)).toEqual([]);
  });
});
