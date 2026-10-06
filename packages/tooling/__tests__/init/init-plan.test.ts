// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  type Action,
  appendBlock,
  appendLine,
  createFile,
  deleteDirectory,
  deleteFile,
  isFileEdit,
  refuse,
  replaceBlock,
} from "../../src/init/action.js";
import { includesAgentsMd, includesSkills, initOptions } from "../../src/init/init-options.js";
import {
  initPlan,
  planExitCode,
  planHasRefusals,
  planIsEmpty,
  planRefusals,
} from "../../src/init/init-plan.js";

/**
 * An action carries the whole text of the file it touches, and a plan holds at most one action per
 * path — the two properties that let a diff be reviewed and then applied without a second look at the
 * project. These cases pin both, and the guards that keep a hand-built plan from writing outside the
 * project.
 *
 * Named after `InitPlanTest` in the Java reference so the two lists diff.
 */

const CARRIER = "@narrativetrace/skills@1.2.3";

describe("one action", () => {
  test("a created file has no before", () => {
    const action = createFile("AGENTS.md", "body\n");

    expect(action.kind).toBe("create");
    expect(action.before).toBe("");
    expect(action.after).toBe("body\n");
    expect(isFileEdit(action)).toBe(true);
  });

  test("a replacement carries both whole file texts", () => {
    const action = replaceBlock("AGENTS.md", "old\n", "new\n");

    expect(action.kind).toBe("replace");
    expect(action.before).toBe("old\n");
    expect(action.after).toBe("new\n");
  });

  test("an append computes its after from what was there", () => {
    const action = appendBlock("AGENTS.md", "# Title\n", "block\n");

    expect(action.kind).toBe("append");
    expect(action.after).toBe("# Title\n\nblock\n");
  });

  test("an appended line ends with the file's own line ending", () => {
    expect(appendLine("CLAUDE.md", "# T\r\n", "@AGENTS.md").after).toBe(
      "# T\r\n\r\n@AGENTS.md\r\n",
    );
    expect(appendLine("CLAUDE.md", "# T\n", "@AGENTS.md").after).toBe("# T\n\n@AGENTS.md\n");
  });

  test("a deletion ends with nothing", () => {
    const action = deleteFile(".agents/skills/a/SKILL.md", "page\n");

    expect(action.after).toBe("");
    expect(isFileEdit(action)).toBe(true);
  });

  test("a removed directory is not a file edit and carries no text", () => {
    const action = deleteDirectory(".agents/skills/a");

    expect(isFileEdit(action)).toBe(false);
    expect(action.before).toBe("");
    expect(action.after).toBe("");
  });

  test("a refusal carries its reason and is not a file edit", () => {
    const action = refuse("AGENTS.md", "exists and carries no section");

    expect(action.kind).toBe("refuse");
    expect(action.reason).toBe("exists and carries no section");
    expect(isFileEdit(action)).toBe(false);
  });

  test.each([
    "/etc/passwd",
    "C:\\Windows\\system32",
    "../outside/AGENTS.md",
    "a/../../outside",
    "",
    "   ",
    ".",
    "./",
  ])("refuses an action on a path outside the project: %j", (path) => {
    expect(() => createFile(path, "x")).toThrow(TypeError);
  });

  // Only a path that STARTS with a drive letter is absolute; a colon inside a name is just a character,
  // and refusing it would refuse a legitimate file.
  test("allows a colon inside a name", () => {
    expect(createFile("docs/notes:2026.md", "x").path).toBe("docs/notes:2026.md");
  });

  test("normalizes a path that stays inside the project", () => {
    expect(createFile("./.agents//skills/a/../a/SKILL.md", "x").path).toBe(
      ".agents/skills/a/SKILL.md",
    );
  });

  test("refuses a refusal without a reason", () => {
    expect(() => refuse("AGENTS.md", "")).toThrow(/must carry a reason/);
    expect(() => refuse("AGENTS.md", "  ")).toThrow(/must carry a reason/);
  });

  test("refuses an action without a path or content", () => {
    expect(() => createFile(undefined as unknown as string, "x")).toThrow(/needs a path/);
    expect(() => createFile("AGENTS.md", undefined as unknown as string)).toThrow(/never null/);
    expect(() => replaceBlock("AGENTS.md", undefined as unknown as string, "x")).toThrow(
      /never null/,
    );
    expect(() => appendBlock("AGENTS.md", "x", undefined as unknown as string)).toThrow(
      /never null/,
    );
    expect(() => appendLine("AGENTS.md", "x", undefined as unknown as string)).toThrow(
      /never null/,
    );
  });
});

describe("a plan", () => {
  test("an empty plan is what a nothing-to-do run looks like", () => {
    const plan = initPlan(CARRIER, false, []);

    expect(planIsEmpty(plan)).toBe(true);
    expect(planHasRefusals(plan)).toBe(false);
    expect(planExitCode(plan)).toBe(0);
  });

  test("a refusal makes the run exit one", () => {
    const plan = initPlan(CARRIER, false, [
      createFile("AGENTS.md", "x"),
      refuse("CLAUDE.md", "no flag"),
    ]);

    expect(planRefusals(plan).map((action) => action.path)).toEqual(["CLAUDE.md"]);
    expect(planExitCode(plan)).toBe(1);
  });

  test("a dry run always exits zero, even with a refusal", () => {
    const plan = initPlan(CARRIER, true, [refuse("CLAUDE.md", "no flag")]);

    expect(planHasRefusals(plan)).toBe(true);
    expect(planExitCode(plan)).toBe(0);
  });

  test("refuses two actions on one path", () => {
    expect(() =>
      initPlan(CARRIER, false, [createFile("AGENTS.md", "a"), replaceBlock("AGENTS.md", "a", "b")]),
    ).toThrow(/one action per path/);
  });

  test("refuses a plan without a carrier", () => {
    expect(() => initPlan("", false, [])).toThrow(/names the carrier/);
    expect(() => initPlan("  ", false, [])).toThrow(/names the carrier/);
  });

  test("keeps its actions immutable", () => {
    const plan = initPlan(CARRIER, false, []);

    expect(() => (plan.actions as Action[]).push(createFile("x", "y"))).toThrow(TypeError);
  });
});

describe("the options", () => {
  test("the default options write nothing they were not asked to", () => {
    expect(initOptions()).toEqual({
      dryRun: false,
      writeExisting: false,
      force: false,
      scope: "both",
      vendorClaude: "auto",
    });
  });

  test("each scope knows what it covers", () => {
    expect([includesSkills("both"), includesAgentsMd("both")]).toEqual([true, true]);
    expect([includesSkills("skills"), includesAgentsMd("skills")]).toEqual([true, false]);
    expect([includesSkills("agents-md"), includesAgentsMd("agents-md")]).toEqual([false, true]);
  });

  test("an override changes only what it names", () => {
    const options = initOptions({ force: true });

    expect(options.force).toBe(true);
    expect(options.writeExisting).toBe(false);
    expect(options.scope).toBe("both");
  });

  test("refuses a scope or a vendor rule it does not know", () => {
    expect(() => initOptions({ scope: "half" as never })).toThrow(/scope is one of/);
    expect(() => initOptions({ vendorClaude: "maybe" as never })).toThrow(/vendor rule is one of/);
  });
});
