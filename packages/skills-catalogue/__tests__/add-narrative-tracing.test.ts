// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCTOR_CHECKS, FRAMEWORK_ROWS } from "@narrativetrace/tooling";
import { describe, expect, it } from "vitest";
import { ADD_NARRATIVE_TRACING } from "../src/catalogue/add-narrative-tracing.js";
import {
  APPLY_FRAMEWORK_FIXES,
  DOCTOR_CHECK_COUNT,
  DOCTOR_REPORT_WELL_FORMED,
  FRAMEWORK_FINDINGS_HOLD,
  INIT_PREVIEW_PRODUCED_A_DIFF,
  RUN_DOCTOR,
} from "../src/catalogue/doctor-commands.js";
import { renderAgentsSkill } from "../src/render/agents-skills.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { commandStrings } from "../src/skill.js";
import { REPO_ROOT } from "./repo-root.js";

// This skill's last step hands off to `narrativetrace
// init`, but only ever previews it — applying the plan is the prompt's own step 3 human gate, not
// this skill's job. These tests pin that the skill can never regress into applying it.

/** Every command string this skill could execute, commands AND verify alike — the applying-form
 * rule must hold no matter which field a future edit puts a stray command into. */
function allCommandStrings(): readonly string[] {
  return [
    ...commandStrings(ADD_NARRATIVE_TRACING),
    ...ADD_NARRATIVE_TRACING.steps.flatMap((step) => (step.verify ? [step.verify] : [])),
  ];
}

describe("add-narrative-tracing: install-the-skills-for-next-time step", () => {
  it("ends with a step that installs the skills for next time", () => {
    const last = ADD_NARRATIVE_TRACING.steps.at(-1);
    expect(last?.title).toBe("Install the skills for next time");
  });

  it("its body is the preview command only, never the applying form", () => {
    const last = ADD_NARRATIVE_TRACING.steps.at(-1);
    expect(last?.body).toEqual({
      kind: "commands",
      commands: ["npx @narrativetrace/cli init --dry-run"],
    });
  });

  it("its verify is the shared INIT_PREVIEW_PRODUCED_A_DIFF check, not a vacuous stand-in", () => {
    const last = ADD_NARRATIVE_TRACING.steps.at(-1);
    expect(last?.verify).toBe(INIT_PREVIEW_PRODUCED_A_DIFF);
  });

  it("no command anywhere in the skill invokes `narrativetrace init` without --dry-run", () => {
    const offenders = allCommandStrings().filter(
      (command) => /@narrativetrace\/cli\s+init\b/.test(command) && !command.includes("--dry-run"),
    );
    expect(offenders).toEqual([]);
  });

  it("carries a never-rule stating why it only previews the install", () => {
    expect(ADD_NARRATIVE_TRACING.never.some((rule) => /--dry-run|preview/i.test(rule.rule))).toBe(
      true,
    );
  });

  it("description says the skill ends by previewing the skills install", () => {
    expect(ADD_NARRATIVE_TRACING.description).toMatch(/preview/i);
  });
});

describe("add-narrative-tracing: the framework step (Phase 6, D2 as amended)", () => {
  const step = ADD_NARRATIVE_TRACING.steps[1];

  it("comes right after the install, and runs the doctor", () => {
    expect(ADD_NARRATIVE_TRACING.steps[0]?.title).toBe("Install with the real toolchain");
    expect(step?.title).toBe("Wire the frameworks this project already uses");
    expect(step?.body).toEqual({ kind: "commands", commands: [RUN_DOCTOR] });
  });

  it("is done when every framework finding holds, selected by the report's own field", () => {
    expect(step?.verify).toBe(FRAMEWORK_FINDINGS_HOLD);
    expect(FRAMEWORK_FINDINGS_HOLD).toContain("f.framework&&f.status!=='pass'");
  });

  it("hands off in the cross-port wording: every fix, in order; no integration shipped is left alone", () => {
    expect(step?.failure?.map((note) => note.fix)).toEqual([APPLY_FRAMEWORK_FIXES]);
    expect(APPLY_FRAMEWORK_FIXES).toContain(
      "run the doctor; apply every config.<framework>-* fix it prints, in order",
    );
    expect(APPLY_FRAMEWORK_FIXES).toContain(
      "a framework it reports as having no integration shipped is left alone",
    );
  });

  it.each([
    [".claude/skills/add-narrative-tracing/SKILL.md"],
    [".agents/skills/add-narrative-tracing/SKILL.md"],
  ])("the rendered page %s names no framework the doctor checks beyond its own worked example", (page) => {
    const text = readFileSync(join(REPO_ROOT, page), "utf-8");
    const example = JSON.parse(
      readFileSync(join(REPO_ROOT, ADD_NARRATIVE_TRACING.fixture, "package.json"), "utf-8"),
    ) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
    const ownExample = new Set(
      Object.keys({ ...example.dependencies, ...example.devDependencies }),
    );
    const named = FRAMEWORK_ROWS.filter((row) => row.check.kind !== "existing-check")
      .filter((row) => !row.marker.packages.some((name) => ownExample.has(name)))
      .filter((row) => text.includes(row.name))
      .map((row) => row.id);
    expect(named).toEqual([]);
  });
});

describe("the doctor's finding count on every page", () => {
  it("is held to the registry's own count", () => {
    expect(DOCTOR_CHECK_COUNT).toBe(DOCTOR_CHECKS.length);
    expect(DOCTOR_REPORT_WELL_FORMED).toContain(`r.findings.length!==${DOCTOR_CHECKS.length})`);
  });
});

describe("add-narrative-tracing: an existing application keeps its entry point", () => {
  const conditional = ADD_NARRATIVE_TRACING.steps.filter((step) => step.condition !== undefined);
  const byTitle = (title: string) => ADD_NARRATIVE_TRACING.steps.find((s) => s.title === title);

  it("exactly the install and first-trace steps carry a condition", () => {
    expect(conditional.map((step) => step.title)).toEqual([
      "Install with the real toolchain",
      "First trace: wrap, call, render, run",
    ]);
  });

  it("the install step leaves the project's own entry point alone", () => {
    expect(byTitle("Install with the real toolchain")?.condition).toMatch(
      /already has an application entry point.*only the dependencies.*leave.*`main`.*start script/s,
    );
  });

  it("the first-trace step runs the application as it runs and reads one real request's trace", () => {
    expect(byTitle("First trace: wrap, call, render, run")?.condition).toMatch(
      /do not add a demo.*run the application the way it already runs.*exercise one real boundary.*read that request's trace/s,
    );
  });

  it("both conditions end in an otherwise branch for a project with no entry point", () => {
    for (const step of conditional) expect(step.condition).toMatch(/; otherwise /);
  });

  it("neither condition names a framework", () => {
    for (const step of conditional) {
      for (const row of FRAMEWORK_ROWS) {
        expect(step.condition?.toLowerCase()).not.toContain(row.id);
      }
    }
  });

  it("renders the when line in both flavours", () => {
    for (const render of [renderClaudeSkill, renderAgentsSkill]) {
      const page = render(ADD_NARRATIVE_TRACING, () => "");
      expect(page).toContain("## 1. Install with the real toolchain\n\n**when:** ");
      expect(page).toContain("## 3. First trace: wrap, call, render, run\n\n**when:** ");
    }
  });
});

describe("add-narrative-tracing hands the next session to narrativetrace-verify (Phase 7 D7)", () => {
  it("its last step names the verify skill and when the next session uses it", () => {
    const last = ADD_NARRATIVE_TRACING.steps.at(-1);
    expect(last?.title).toBe("Install the skills for next time");
    expect(last?.flag).toContain("the next session verifies with narrativetrace-verify");
    expect(last?.flag).toContain("once a change's tests are green");
  });
});
