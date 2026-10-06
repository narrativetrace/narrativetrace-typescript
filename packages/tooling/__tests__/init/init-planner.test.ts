// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { Action } from "../../src/init/action.js";
import { renderAgentsMdBlock } from "../../src/init/agents-md-block.js";
import { initOptions } from "../../src/init/init-options.js";
import { planExitCode, planRefusals } from "../../src/init/init-plan.js";
import { AGENTS_MD, CLAUDE_MD, planInstall } from "../../src/init/init-planner.js";
import { installedSkill } from "../../src/init/installed-skill.js";
import { CREATED_NOTE } from "../../src/init/marked-block.js";
import { type ProjectState, projectState } from "../../src/init/project-state.js";
import { coordinateIn, provenanceLine } from "../../src/init/provenance.js";
import { FAKE_COORDINATE, fakeCarrier, fakePage } from "./fixtures.js";

/**
 * Every row of the existing-file policy (design D8) as its own case, with the near misses beside it.
 * The planner is pure, so none of this touches a disk.
 *
 * Named after `InitPlannerTest` in the Java reference so the two lists diff.
 */

const CARRIER = fakeCarrier(["a"]);
const TWO_SKILLS = fakeCarrier(["a", "b"]);
const PERMISSIVE = initOptions({ writeExisting: true, force: true });

function block(state: ProjectState = projectState()): string {
  return renderAgentsMdBlock(CARRIER, state);
}

function actionFor(plan: { actions: readonly Action[] }, path: string): Action | undefined {
  return plan.actions.find((action) => action.path === path);
}

function ourPage(name = "a", flavour: "agents" | "claude" = "agents"): string {
  const page = fakePage(name, flavour);
  return `${page.slice(0, page.indexOf("---\n\n") + 4)}${provenanceLine(FAKE_COORDINATE)}\n${page.slice(page.indexOf("---\n\n") + 4)}`;
}

describe("the managed section", () => {
  test("creates AGENTS.md with the block and the created note when there is none", () => {
    const plan = planInstall(projectState(), CARRIER);

    const action = actionFor(plan, AGENTS_MD);
    expect(action?.kind).toBe("create");
    expect(action?.after).toBe(`${CREATED_NOTE}\n${block()}`);
  });

  test("refuses an existing AGENTS.md without the flag and names the flag", () => {
    const plan = planInstall(projectState({ agentsMd: "# Title\n" }), CARRIER);

    const action = actionFor(plan, AGENTS_MD);
    expect(action?.kind).toBe("refuse");
    expect(action?.reason).toContain("--write-existing");
    expect(planExitCode(plan)).toBe(1);
  });

  test("appends to an existing AGENTS.md with the flag", () => {
    const plan = planInstall(projectState({ agentsMd: "# Title\n" }), CARRIER, PERMISSIVE);

    const action = actionFor(plan, AGENTS_MD);
    expect(action?.kind).toBe("append");
    expect(action?.after).toBe(`# Title\n\n${block()}`);
  });

  test("replaces our own block without any flag", () => {
    const stale = `# Title\n\n${renderAgentsMdBlock(fakeCarrier(["a"], "@narrativetrace/skills@0.0.9"), projectState())}`;

    const plan = planInstall(projectState({ agentsMd: stale }), CARRIER);

    const action = actionFor(plan, AGENTS_MD);
    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe(`# Title\n\n${block()}`);
  });

  test("plans nothing for an AGENTS.md that is already current", () => {
    const current = `# Title\n\n${block()}`;

    const plan = planInstall(
      projectState({ agentsMd: current }),
      CARRIER,
      initOptions({ scope: "agents-md" }),
    );

    expect(plan.actions).toEqual([]);
  });

  test("refuses an AGENTS.md with two blocks and names the lines", () => {
    const twice = `${block()}\ntext\n\n${block()}`;

    const plan = planInstall(projectState({ agentsMd: twice }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, AGENTS_MD)?.reason).toContain("line 1");
    expect(actionFor(plan, AGENTS_MD)?.reason).toMatch(/two or more/);
  });

  test("refuses an AGENTS.md with a marker that never closes", () => {
    const broken = "<!-- narrativetrace:start -->\nbody\n";

    const plan = planInstall(projectState({ agentsMd: broken }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, AGENTS_MD)?.reason).toContain("no end below it");
  });

  test("the rest of the plan proceeds when AGENTS.md is refused", () => {
    const plan = planInstall(projectState({ agentsMd: "# Title\n" }), CARRIER);

    expect(actionFor(plan, ".agents/skills/a/SKILL.md")?.kind).toBe("create");
    expect(planRefusals(plan)).toHaveLength(1);
  });

  test("does not mistake a marker inside a fenced block for ours", () => {
    const fenced = `# Docs\n\n\`\`\`\n${block()}\`\`\`\n`;

    const plan = planInstall(projectState({ agentsMd: fenced }), CARRIER, PERMISSIVE);

    const action = actionFor(plan, AGENTS_MD);
    expect(action?.kind).toBe("append");
    expect(action?.after).toBe(`${fenced}\n${block()}`);
  });

  test("writes the block with the file's own line endings", () => {
    const plan = planInstall(projectState({ agentsMd: "# Title\r\n" }), CARRIER, PERMISSIVE);

    const after = actionFor(plan, AGENTS_MD)?.after ?? "";
    expect(after).toBe(`# Title\r\n\r\n${block().replaceAll("\n", "\r\n")}`);
    expect(after).not.toMatch(/[^\r]\n/);
  });

  test("keeps a byte-order mark and a missing final newline in mind", () => {
    const plan = planInstall(projectState({ agentsMd: "﻿# Title" }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, AGENTS_MD)?.after).toBe(`﻿# Title\n\n${block()}`);
  });

  test("appends to an empty but existing AGENTS.md with the flag", () => {
    const plan = planInstall(projectState({ agentsMd: "" }), CARRIER, PERMISSIVE);

    const action = actionFor(plan, AGENTS_MD);
    expect(action?.kind).toBe("append");
    expect(action?.after).toBe(block());
  });

  test("refuses to append to an AGENTS.md that ends inside an unfinished fence", () => {
    const plan = planInstall(projectState({ agentsMd: "# T\n\n```\ncode\n" }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, AGENTS_MD)?.reason).toContain("unfinished fenced code block");
  });

  // The fence is unfinished, so an APPEND to this file would be refused — but our own section is
  // already above it, and replacing a region never appends anything, so the fence is irrelevant.
  test("still replaces our own section in a file whose fence opens after it", () => {
    const text =
      "<!-- narrativetrace:start -->\nstale\n<!-- narrativetrace:end -->\n\n```\nnot closed\n";

    const plan = planInstall(projectState({ agentsMd: text }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, AGENTS_MD)?.kind).toBe("replace");
    expect(actionFor(plan, AGENTS_MD)?.after).toBe(`${block()}\n\`\`\`\nnot closed\n`);
  });
});

describe("the vendor context file", () => {
  test("creates no vendor context file when the project has none", () => {
    expect(actionFor(planInstall(projectState(), CARRIER, PERMISSIVE), CLAUDE_MD)).toBeUndefined();
  });

  test("appends the import line to an existing vendor context file with the flag", () => {
    const plan = planInstall(projectState({ claudeMd: "# Rules\n" }), CARRIER, PERMISSIVE);

    const action = actionFor(plan, CLAUDE_MD);
    expect(action?.kind).toBe("append-line");
    expect(action?.after).toBe("# Rules\n\n@AGENTS.md\n");
  });

  test("refuses to touch the vendor context file without the flag", () => {
    const plan = planInstall(projectState({ claudeMd: "# Rules\n" }), CARRIER);

    expect(actionFor(plan, CLAUDE_MD)?.reason).toContain("--write-existing");
  });

  test("leaves a vendor context file that already imports alone", () => {
    const plan = planInstall(
      projectState({ claudeMd: "# Rules\n\n@AGENTS.md\n" }),
      CARRIER,
      PERMISSIVE,
    );

    expect(actionFor(plan, CLAUDE_MD)).toBeUndefined();
  });

  test("counts an import line with trailing spaces as already there", () => {
    const plan = planInstall(projectState({ claudeMd: "@AGENTS.md   \n" }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, CLAUDE_MD)).toBeUndefined();
  });

  test("does not count an import line inside a comment or a fence", () => {
    const hidden = "<!-- @AGENTS.md -->\n\n```\n@AGENTS.md\n```\n";

    const plan = planInstall(projectState({ claudeMd: hidden }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, CLAUDE_MD)?.kind).toBe("append-line");
  });

  test("refuses to add the import line to a vendor file that ends inside an unfinished fence", () => {
    const plan = planInstall(projectState({ claudeMd: "# R\n\n```\ncode\n" }), CARRIER, PERMISSIVE);

    expect(actionFor(plan, CLAUDE_MD)?.reason).toContain("unfinished fenced code block");
  });
});

describe("the skill directories", () => {
  test("copies every skill into the open-standard path with its provenance line", () => {
    const plan = planInstall(projectState(), TWO_SKILLS);

    for (const name of ["a", "b"]) {
      const action = actionFor(plan, `.agents/skills/${name}/SKILL.md`);
      expect(action?.kind).toBe("create");
      expect(coordinateIn(action?.after ?? "")).toBe(FAKE_COORDINATE);
      expect(action?.after).toContain(`# ${name} (agents)`);
    }
  });

  test("installs the vendor flavour where the vendor is detected", () => {
    const detected = planInstall(projectState({ claudeDirectory: true }), CARRIER);
    const byContextFile = planInstall(projectState({ claudeMd: "@AGENTS.md\n" }), CARRIER);

    expect(actionFor(detected, ".claude/skills/a/SKILL.md")?.after).toContain("# a (claude)");
    expect(actionFor(byContextFile, ".claude/skills/a/SKILL.md")).toBeDefined();
    expect(
      actionFor(planInstall(projectState(), CARRIER), ".claude/skills/a/SKILL.md"),
    ).toBeUndefined();
  });

  test("obeys an explicit vendor choice over detection", () => {
    const on = planInstall(projectState(), CARRIER, initOptions({ vendorClaude: "on" }));
    const off = planInstall(
      projectState({ claudeDirectory: true }),
      CARRIER,
      initOptions({ vendorClaude: "off" }),
    );

    expect(actionFor(on, ".claude/skills/a/SKILL.md")).toBeDefined();
    expect(actionFor(off, ".claude/skills/a/SKILL.md")).toBeUndefined();
  });

  test("plans nothing for a skill that is already exactly right", () => {
    const state = projectState({
      agentsMd: `${block()}`,
      installedSkills: [installedSkill("agents", "a", "ours", FAKE_COORDINATE, ourPage())],
    });

    expect(planInstall(state, CARRIER).actions).toEqual([]);
  });

  test("upgrades a skill installed from an older carrier without any flag", () => {
    const older = ourPage().replace(FAKE_COORDINATE, "@narrativetrace/skills@0.0.9");
    const state = projectState({
      installedSkills: [
        installedSkill("agents", "a", "ours", "@narrativetrace/skills@0.0.9", older),
      ],
    });

    const action = actionFor(planInstall(state, CARRIER), ".agents/skills/a/SKILL.md");
    expect(action?.kind).toBe("replace");
    expect(coordinateIn(action?.after ?? "")).toBe(FAKE_COORDINATE);
  });

  test("refuses a skill directory somebody else owns and lets the others proceed", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "a", "foreign", "", "somebody else's page\n")],
    });

    const plan = planInstall(state, TWO_SKILLS);

    expect(actionFor(plan, ".agents/skills/a")?.reason).toContain("--force");
    expect(actionFor(plan, ".agents/skills/b/SKILL.md")?.kind).toBe("create");
  });

  test("overwrites a foreign skill directory when forced", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "a", "foreign", "", "somebody else's page\n")],
    });

    const action = actionFor(planInstall(state, CARRIER, PERMISSIVE), ".agents/skills/a/SKILL.md");
    expect(action?.kind).toBe("replace");
    expect(action?.before).toBe("somebody else's page\n");
  });

  test("creates the page when a foreign directory has none and force is given", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "a", "foreign", "", "")],
    });

    expect(
      actionFor(planInstall(state, CARRIER, PERMISSIVE), ".agents/skills/a/SKILL.md")?.kind,
    ).toBe("create");
  });

  test("refuses a file sitting where a skill directory belongs even when forced", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "a", "not-a-directory")],
    });

    const action = actionFor(planInstall(state, CARRIER, PERMISSIVE), ".agents/skills/a");
    expect(action?.kind).toBe("refuse");
    expect(action?.reason).toContain("not a directory");
  });
});

describe("scope, rule files and the plan's own shape", () => {
  test("plans only the half it was asked for", () => {
    const skillsOnly = planInstall(projectState(), CARRIER, initOptions({ scope: "skills" }));
    const sectionOnly = planInstall(projectState(), CARRIER, initOptions({ scope: "agents-md" }));

    expect(skillsOnly.actions.map((action) => action.path)).toEqual([".agents/skills/a/SKILL.md"]);
    expect(sectionOnly.actions.map((action) => action.path)).toEqual([AGENTS_MD]);
  });

  test("keeps an existing block in a vendor rule file up to date", () => {
    const stale = `# Rules\n\n${renderAgentsMdBlock(fakeCarrier(["a"], "@narrativetrace/skills@0.0.9"), projectState())}`;
    const state = projectState({ markedRuleFiles: new Map([[".cursorrules", stale]]) });

    const action = actionFor(planInstall(state, CARRIER), ".cursorrules");
    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe(`# Rules\n\n${block(state)}`);
  });

  test("never creates or appends to a vendor rule file", () => {
    const state = projectState({ markedRuleFiles: new Map([[".cursorrules", "# Rules\n"]]) });

    expect(actionFor(planInstall(state, CARRIER, PERMISSIVE), ".cursorrules")?.kind).toBe("refuse");
  });

  test("refuses a vendor rule file with two blocks", () => {
    const state = projectState({
      markedRuleFiles: new Map([[".cursorrules", `${block()}\nx\n\n${block()}`]]),
    });

    expect(actionFor(planInstall(state, CARRIER), ".cursorrules")?.reason).toMatch(/two or more/);
  });

  test("stamps the plan with the carrier and carries the dry-run flag", () => {
    const plan = planInstall(projectState(), CARRIER, initOptions({ dryRun: true }));

    expect(plan.carrier).toBe(FAKE_COORDINATE);
    expect(plan.dryRun).toBe(true);
  });

  test("never plans two actions on one path", () => {
    const state = projectState({
      claudeDirectory: true,
      claudeMd: "# Rules\n",
      agentsMd: "# Title\n",
      markedRuleFiles: new Map([[".cursorrules", "# Rules\n"]]),
      installedSkills: [installedSkill("claude", "a", "foreign", "", "x\n")],
    });

    const paths = planInstall(state, TWO_SKILLS, PERMISSIVE).actions.map((action) => action.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  test("refuses to plan without a snapshot or a carrier", () => {
    expect(() => planInstall(undefined as never, CARRIER)).toThrow(TypeError);
    expect(() => planInstall(projectState(), undefined as never)).toThrow(TypeError);
    // A caller from JavaScript can hand over `null`; the default parameter only covers `undefined`.
    expect(() => planInstall(projectState(), CARRIER, null as never)).toThrow(TypeError);
  });

  test("omitted options are the defaults, not an error", () => {
    expect(planInstall(projectState(), CARRIER).actions).toEqual(
      planInstall(projectState(), CARRIER, initOptions()).actions,
    );
  });
});
