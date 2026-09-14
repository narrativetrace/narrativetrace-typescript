// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import type { Skill } from "../src/skill.js";
import {
  commandStrings,
  descriptionFitsBudget,
  firstToken,
  stepsWithoutVerify,
  vocabularyViolations,
} from "../src/skill.js";

// Direct, synthetic-fixture unit tests for the pure schema helpers — the catalogue-index tests
// exercise these too, but only through the two real, already-compliant skills, which never hits
// the edge cases (a mixed step list, a disallowed command, a missing verify, the exact budget
// boundary) these functions actually branch on.

const BASE: Skill = {
  canonicalName: "example-skill",
  skillClass: "mechanical",
  description: "An example skill.",
  fixture: "examples/sixty-seconds",
  allowedTools: ["pnpm", "node"],
  steps: [],
  always: [],
  never: [],
};

describe("commandStrings", () => {
  it("collects commands only from 'commands' steps, skipping 'snippet' steps", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        { title: "run it", body: { kind: "commands", commands: ["pnpm test"] } },
        { title: "show it", body: { kind: "snippet", path: "x.js", language: "js" } },
        { title: "run more", body: { kind: "commands", commands: ["node -e 1"] } },
      ],
    };
    expect(commandStrings(skill)).toEqual(["pnpm test", "node -e 1"]);
  });

  it("returns an empty array for a skill with only snippet steps", () => {
    const skill: Skill = {
      ...BASE,
      steps: [{ title: "show it", body: { kind: "snippet", path: "x.js", language: "js" } }],
    };
    expect(commandStrings(skill)).toEqual([]);
  });
});

describe("firstToken", () => {
  it("returns the first whitespace-separated token", () => {
    expect(firstToken("pnpm install --frozen-lockfile")).toBe("pnpm");
  });

  it("trims leading whitespace before tokenizing", () => {
    expect(firstToken("   pnpm test")).toBe("pnpm");
  });

  it("collapses multiple separating spaces into one split point", () => {
    expect(firstToken("pnpm    test")).toBe("pnpm");
  });

  it("treats a tab or newline as a separator, not just a space", () => {
    expect(firstToken("pnpm\ttest")).toBe("pnpm");
    expect(firstToken("pnpm\ntest")).toBe("pnpm");
  });

  it("returns the empty string for a command that is only whitespace", () => {
    expect(firstToken("   ")).toBe("");
  });

  it("returns the empty string for a genuinely empty command", () => {
    expect(firstToken("")).toBe("");
  });
});

describe("vocabularyViolations", () => {
  it("is empty when every command's first token is in the closed vocabulary", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        { title: "run it", body: { kind: "commands", commands: ["pnpm test", "git status"] } },
      ],
    };
    expect(vocabularyViolations(skill)).toEqual([]);
  });

  it("names the skill and the offending command for a disallowed first token", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        { title: "run it", body: { kind: "commands", commands: ["curl https://example.com"] } },
      ],
    };
    expect(vocabularyViolations(skill)).toEqual(["example-skill: curl https://example.com"]);
  });
});

describe("descriptionFitsBudget", () => {
  it("fits when strictly under the 1024-char budget", () => {
    expect(descriptionFitsBudget({ ...BASE, description: "x".repeat(100) })).toBe(true);
  });

  it("fits exactly at the 1024-char budget boundary", () => {
    expect(descriptionFitsBudget({ ...BASE, description: "x".repeat(1024) })).toBe(true);
  });

  it("does not fit one character over the budget", () => {
    expect(descriptionFitsBudget({ ...BASE, description: "x".repeat(1025) })).toBe(false);
  });
});

describe("stepsWithoutVerify", () => {
  it("names only the steps missing verify, by title", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        {
          title: "verified",
          body: { kind: "commands", commands: ["pnpm test"] },
          verify: "pnpm test",
        },
        { title: "unverified", body: { kind: "commands", commands: ["pnpm build"] } },
      ],
    };
    expect(stepsWithoutVerify(skill)).toEqual(["unverified"]);
  });

  it("is empty when every step carries a verify", () => {
    const skill: Skill = {
      ...BASE,
      steps: [
        {
          title: "verified",
          body: { kind: "commands", commands: ["pnpm test"] },
          verify: "pnpm test",
        },
      ],
    };
    expect(stepsWithoutVerify(skill)).toEqual([]);
  });
});
