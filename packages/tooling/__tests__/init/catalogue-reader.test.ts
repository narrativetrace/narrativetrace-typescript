// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readSkillCatalogue } from "../../src/init/catalogue-reader.js";
import {
  installRootOf,
  pathFor,
  SKILL_FLAVOURS,
  skillCatalogue,
  skillEntry,
  skillNamed,
} from "../../src/init/skill-catalogue.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "../repo-root.js";

/**
 * One place knows the catalogue's shape. Every field is mandatory and every type is checked at read
 * time, so a malformed carrier is refused before any plan exists — never half-installed.
 *
 * Named after `CatalogueReaderTest` in the Java reference so the two lists diff. Java hand-wrote a
 * JSON reader (the JDK ships none) and tested it separately in `JsonReaderTest`; here `JSON.parse`
 * is that built-in, so the subset rules Java's reader enforced — a catalogue holds only strings —
 * are enforced by this reader's own type checks instead, and the cases that pinned them live here.
 */

const ONE_SKILL = JSON.stringify({
  runtime: "typescript",
  skills: [
    {
      name: "narrativetrace-doctor",
      description: "Diagnoses an install.",
      agents: "agents/narrativetrace-doctor/SKILL.md",
      claude: "claude/narrativetrace-doctor/SKILL.md",
    },
  ],
});

describe("reading a catalogue", () => {
  test("reads the runtime and one skill from a catalogue", () => {
    const catalogue = readSkillCatalogue(ONE_SKILL);

    expect(catalogue.runtime).toBe("typescript");
    expect(catalogue.skills).toHaveLength(1);
    expect(catalogue.skills[0]).toEqual({
      name: "narrativetrace-doctor",
      description: "Diagnoses an install.",
      agentsPath: "agents/narrativetrace-doctor/SKILL.md",
      claudePath: "claude/narrativetrace-doctor/SKILL.md",
    });
  });

  test.skipIf(!REPO_ROOT_REACHABLE)("reads the real checked-in catalogue", () => {
    const json = readFileSync(join(REPO_ROOT, "packages/skills/catalogue.json"), "utf8");

    const catalogue = readSkillCatalogue(json);

    expect(catalogue.runtime).toBe("typescript");
    expect(catalogue.skills.map((skill) => skill.name)).toEqual([
      "narrativetrace-doctor",
      "add-narrative-tracing",
      "narrativetrace-feedback",
      "add-narrativetrace-clarity",
      "narrativetrace-verify",
      "narrativetrace-debug",
    ]);
    for (const skill of catalogue.skills) {
      for (const flavour of SKILL_FLAVOURS) {
        expect(pathFor(skill, flavour)).toBe(`${flavour}/${skill.name}/SKILL.md`);
      }
    }
  });

  test("finds a skill by name and reports an unknown one as undefined", () => {
    const catalogue = readSkillCatalogue(ONE_SKILL);

    expect(skillNamed(catalogue, "narrativetrace-doctor")?.description).toBe(
      "Diagnoses an install.",
    );
    expect(skillNamed(catalogue, "nope")).toBeUndefined();
  });

  test("each flavour knows where it installs", () => {
    expect(installRootOf("agents")).toBe(".agents/skills");
    expect(installRootOf("claude")).toBe(".claude/skills");
    expect(SKILL_FLAVOURS).toEqual(["agents", "claude"]);
  });
});

describe("refusals", () => {
  function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: "a",
      description: "d",
      agents: "agents/a/SKILL.md",
      claude: "claude/a/SKILL.md",
      ...overrides,
    };
  }

  function catalogue(overrides: Record<string, unknown>): string {
    return JSON.stringify({ runtime: "typescript", skills: [entry()], ...overrides });
  }

  test("refuses a catalogue that names the same skill twice", () => {
    expect(() => readSkillCatalogue(catalogue({ skills: [entry(), entry()] }))).toThrow(
      /names a skill twice.*\ba\b/s,
    );
  });

  test("refuses a skill missing a flavour path and names it", () => {
    const json = catalogue({
      skills: [{ name: "a", description: "d", agents: "agents/a/SKILL.md" }],
    });

    expect(() => readSkillCatalogue(json)).toThrow(/"claude"/);
    expect(() => readSkillCatalogue(json)).toThrow(/\ba\b/);
  });

  test("refuses a skill whose name is not a string", () => {
    expect(() => readSkillCatalogue(catalogue({ skills: [entry({ name: 7 })] }))).toThrow(/"name"/);
  });

  test("refuses a skill that is not an object", () => {
    expect(() => readSkillCatalogue(catalogue({ skills: ["narrativetrace-doctor"] }))).toThrow(
      /must be a JSON object/,
    );
  });

  test("refuses a catalogue without a skills array", () => {
    expect(() => readSkillCatalogue(catalogue({ skills: "one" }))).toThrow(
      /"skills" must be a JSON array/,
    );
  });

  test("refuses a catalogue without a runtime", () => {
    expect(() => readSkillCatalogue(catalogue({ runtime: undefined }))).toThrow(/"runtime"/);
  });

  test("refuses a catalogue that carries no skill at all", () => {
    expect(() => readSkillCatalogue(catalogue({ skills: [] }))).toThrow(/at least one skill/);
  });

  test("refuses a catalogue that is not an object at all", () => {
    expect(() => readSkillCatalogue('"just a string"')).toThrow(/must be a JSON object/);
    expect(() => readSkillCatalogue("[]")).toThrow(/must be a JSON object/);
  });

  test("refuses a skill whose description is blank", () => {
    expect(() => readSkillCatalogue(catalogue({ skills: [entry({ description: "  " })] }))).toThrow(
      /description/,
    );
  });

  test("refuses text that is not JSON at all, naming what it was reading", () => {
    expect(() => readSkillCatalogue("{ not json")).toThrow(/catalogue/);
  });
});

describe("the catalogue's own guards", () => {
  test("refuses a catalogue built without a skill list", () => {
    expect(() => skillCatalogue("typescript", [])).toThrow(/at least one skill/);
  });

  test("refuses a blank runtime", () => {
    expect(() => skillCatalogue(" ", [skillEntry("a", "d", "x", "y")])).toThrow(/runtime/);
  });

  test("refuses a skill entry with a blank field, naming the field", () => {
    expect(() => skillEntry("", "d", "x", "y")).toThrow(/name/);
    expect(() => skillEntry("a", "", "x", "y")).toThrow(/description/);
    expect(() => skillEntry("a", "d", "", "y")).toThrow(/agents path/);
    expect(() => skillEntry("a", "d", "x", "")).toThrow(/claude path/);
  });

  test("keeps its skill list immutable", () => {
    const catalogue = skillCatalogue("typescript", [skillEntry("a", "d", "x", "y")]);

    expect(() => (catalogue.skills as unknown as unknown[]).push("b")).toThrow(TypeError);
  });
});
