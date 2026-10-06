// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFile, refuse } from "../../src/init/action.js";
import { renderAgentsMdBlock } from "../../src/init/agents-md-block.js";
import { openCarrier, resolveCarrier } from "../../src/init/carrier.js";
import { readSkillCatalogue } from "../../src/init/catalogue-reader.js";
import { appliedAction, executionReport } from "../../src/init/execution-report.js";
import { initOptions } from "../../src/init/init-options.js";
import { initPlan } from "../../src/init/init-plan.js";
import { planInstall } from "../../src/init/init-planner.js";
import { installedSkill } from "../../src/init/installed-skill.js";
import { applyPlan } from "../../src/init/plan-executor.js";
import { projectState } from "../../src/init/project-state.js";
import { readProjectState } from "../../src/init/project-state-reader.js";
import { planRefresh } from "../../src/init/refresh-planner.js";
import { skillCatalogue, skillEntry } from "../../src/init/skill-catalogue.js";
import { planUninstall } from "../../src/init/uninstall-planner.js";
import { carrierVersionWarning } from "../../src/init/version-guard.js";
import { fakeCarrier } from "./fixtures.js";

/**
 * Every sentence this library can put in front of a person, asserted WHOLE and in one place.
 *
 * INTENT: a refusal is only useful if it names what to do next, and a guard is only useful if it says
 * which argument was missing — so the words are the contract, not decoration. Asserting them in the
 * behavioural tests as fragments (`toContain("--force")`) leaves the second half of every concatenated
 * message unpinned, which a mutation run makes visible: it rewrites the tail and nothing fails. This
 * file is the answer, and it keeps the behavioural tests readable by not spelling every message twice.
 */

const CARRIER = fakeCarrier(["a"]);
const PERMISSIVE = initOptions({ writeExisting: true, force: true });

/** The message a call throws, so a test can compare it whole instead of matching a fragment. */
function messageOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the call was expected to throw and did not");
}

/** The reason the plan gives for the action on one path. */
function reasonFor(state: Parameters<typeof planInstall>[0], path: string): string {
  const action = planInstall(state, CARRIER, initOptions()).actions.find((a) => a.path === path);
  if (action === undefined) throw new Error(`no action on ${path}`);
  return action.reason;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-messages-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("what an install refuses, and how it says so", () => {
  test("a context file that exists and carries no section", () => {
    expect(reasonFor(projectState({ agentsMd: "# Title\n" }), "AGENTS.md")).toBe(
      "AGENTS.md exists and carries no NarrativeTrace section — re-run with --write-existing to" +
        " append one",
    );
  });

  test("a vendor context file that does not import the managed home", () => {
    expect(reasonFor(projectState({ claudeMd: "# Rules\n" }), "CLAUDE.md")).toBe(
      "CLAUDE.md exists and does not import AGENTS.md — re-run with --write-existing to add the" +
        " one-line import",
    );
  });

  test("a file that ends inside an unfinished fenced code block", () => {
    const state = projectState({ agentsMd: "# T\n\n```\ncode\n" });

    expect(
      planInstall(state, CARRIER, PERMISSIVE).actions.find((a) => a.path === "AGENTS.md")?.reason,
    ).toBe(
      "AGENTS.md ends inside an unfinished fenced code block — close the fence, and anything" +
        " appended after it will be read as text rather than as code",
    );
  });

  test("a skill directory somebody else owns", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "a", "foreign", "", "theirs\n")],
    });

    expect(reasonFor(state, ".agents/skills/a")).toBe(
      ".agents/skills/a was not installed by narrativetrace — re-run with --force to overwrite this" +
        " skill, or move the directory aside",
    );
  });

  test("a file sitting where a skill directory belongs", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "a", "not-a-directory")],
    });

    expect(reasonFor(state, ".agents/skills/a")).toBe(
      ".agents/skills/a is not a directory — move it aside and run the install again",
    );
  });

  test("a context file carrying two sections names both lines", () => {
    const block = renderAgentsMdBlock(CARRIER, projectState());
    const state = projectState({ agentsMd: `${block}\nx\n\n${block}` });

    expect(reasonFor(state, "AGENTS.md")).toBe(
      "AGENTS.md carries two or more NarrativeTrace sections (line 1, line 28) — leave exactly one",
    );
  });

  test("a context file whose markers do not pair up repeats the scanner's own words", () => {
    const state = projectState({ agentsMd: "<!-- narrativetrace:start -->\nbody\n" });

    expect(reasonFor(state, "AGENTS.md")).toBe(
      "AGENTS.md: line 1: a narrativetrace:start marker with no end below it",
    );
  });

  test("an uninstall will not guess which of two sections to remove", () => {
    const block = renderAgentsMdBlock(CARRIER, projectState());
    const state = projectState({ agentsMd: `${block}\nx\n\n${block}` });

    expect(planUninstall(state).actions[0]?.reason).toBe(
      "AGENTS.md does not carry exactly one NarrativeTrace section — remove it by hand",
    );
  });

  test("a directory the executor will not empty", () => {
    const plan = initPlan("@narrativetrace/skills@1.2.3", false, [
      { kind: "delete-directory", path: "held", before: "", after: "", reason: "" },
    ]);
    writeFileSync(join(dir, "held"), "not a directory");

    expect(applyPlan(plan, dir).results[0]?.detail).toContain("ENOTDIR");
  });
});

describe("what the version guard says", () => {
  test("names both versions and the command, whole", () => {
    const carrier = fakeCarrier(["a"], "@narrativetrace/skills@1.2.3");

    expect(carrierVersionWarning(carrier, projectState({ projectVersion: "0.9.0" }))).toBe(
      "note: these pages come from @narrativetrace/skills@1.2.3, but this project resolves" +
        " NarrativeTrace 0.9.0 — run `npx --yes @narrativetrace/cli@0.9.0 init` to install the pages" +
        " that match it.",
    );
  });
});

describe("what a carrier says when it will not open", () => {
  test("no home holds one", () => {
    expect(messageOf(() => resolveCarrier({ projectDirectory: dir, bundledDirectory: dir }))).toBe(
      `no skills carrier found — tried bundled (${dir})`,
    );
  });

  test("no home was given at all", () => {
    expect(messageOf(() => resolveCarrier({ projectDirectory: dir }))).toBe(
      "no skills carrier found — tried nothing: no home was given",
    );
  });

  test("the directory holds no catalogue", () => {
    expect(messageOf(() => openCarrier(dir))).toBe(
      `no catalogue.json in ${dir} — looked there and in skills/`,
    );
  });

  test("a page is not valid UTF-8", () => {
    writeFileSync(join(dir, "AGENTS.md"), Buffer.from([0xff, 0xfe]));

    expect(messageOf(() => readProjectState(dir))).toBe(
      `${join(dir, "AGENTS.md")} is not valid UTF-8, so it cannot be planned against`,
    );
  });

  test("a version that cannot be stamped", () => {
    writeFileSync(join(dir, "catalogue.json"), JSON.stringify({ runtime: "t", skills: [] }));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.2/3" }));

    expect(messageOf(() => openCarrier(dir))).toBe(
      'a carrier is stamped with its own coordinate, and the version "1.2/3" cannot be one — it' +
        ' must carry no "@", no path separator and no whitespace',
    );
  });
});

describe("what a guard says about a missing argument", () => {
  test.each([
    [
      () => planInstall(undefined as never, CARRIER),
      "planning needs a project state, a carrier and options",
    ],
    [
      () => planUninstall(undefined as never),
      "planning an uninstall needs a project state and options",
    ],
    [
      () => planRefresh(undefined as never, CARRIER),
      "planning a refresh needs a project state and a carrier",
    ],
    [
      () => applyPlan(undefined as never, dir),
      "applying a plan needs the plan and a project directory",
    ],
    [
      () => renderAgentsMdBlock(undefined as never, projectState()),
      "a carrier and a project state are needed to render the section",
    ],
    [
      () => carrierVersionWarning(undefined as never, projectState()),
      "the version guard needs a carrier and a project state",
    ],
    [() => initPlan("", false, []), "a plan names the carrier it came from"],
    [() => executionReport("", []), "a report names the carrier the plan came from"],
    [() => refuse("AGENTS.md", " "), "a refusal must carry a reason naming what it refused"],
    [
      () => appliedAction(createFile("a.md", "x"), "refused", " "),
      "a refusal carries the reason it refused — a.md gives none",
    ],
    [
      () => createFile("AGENTS.md", undefined as never),
      'an action\'s after text is "" when absent, never null',
    ],
    [() => installedSkill("agents", " ", "foreign"), "an installed skill's name must not be blank"],
    [
      () => installedSkill("agents", "a", "ours", "   "),
      "an installed skill of ours carries its coordinate",
    ],
    [
      () => projectState({ outputDirectory: " " }),
      "a project state names where traces land, never an empty directory",
    ],
    [
      () => skillCatalogue(" ", [skillEntry("a", "d", "x", "y")]),
      "a catalogue's runtime must not be blank",
    ],
    [() => skillCatalogue("typescript", []), "a catalogue must list at least one skill"],
    [() => skillEntry("a", "d", " ", "y"), "a catalogue skill's agents path must not be blank"],
    [
      () => initOptions({ scope: "half" as never }),
      'an install\'s scope is one of skills, agents-md, both, got "half"',
    ],
    [
      () => initOptions({ vendorClaude: "maybe" as never }),
      'an install\'s vendor rule is one of auto, on, off, got "maybe"',
    ],
    [
      () => readSkillCatalogue(JSON.stringify({ runtime: "t", skills: [{ name: 1 }] })),
      'catalogue: skill has no "name" string field',
    ],
    [
      () => readSkillCatalogue(JSON.stringify({ runtime: "t", skills: [{ name: "a" }] })),
      'catalogue: a has no "description" string field',
    ],
    [() => readSkillCatalogue("[]"), "catalogue: catalogue must be a JSON object"],
    [
      () => readSkillCatalogue(JSON.stringify({ runtime: "t", skills: "one" })),
      'catalogue: "skills" must be a JSON array',
    ],
  ])("%#", (call, message) => {
    expect(messageOf(call)).toBe(message);
  });

  test("a path that leaves the project names the path it was given", () => {
    expect(messageOf(() => createFile("../outside", "x"))).toBe(
      'an action\'s path must stay inside the project, got "../outside"',
    );
    expect(messageOf(() => createFile("/etc/passwd", "x"))).toBe(
      'an action\'s path must be project-relative, got "/etc/passwd"',
    );
    expect(messageOf(() => createFile("./", "x"))).toBe(
      'an action\'s path must name something, got "./"',
    );
  });
});
