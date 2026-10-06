// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { Action } from "../../src/init/action.js";
import { renderAgentsMdBlock } from "../../src/init/agents-md-block.js";
import { type Carrier, carrierBody } from "../../src/init/carrier.js";
import { initOptions } from "../../src/init/init-options.js";
import { planExitCode, planIsEmpty } from "../../src/init/init-plan.js";
import { AGENTS_MD, CLAUDE_MD } from "../../src/init/init-planner.js";
import { installedSkill } from "../../src/init/installed-skill.js";
import { CREATED_NOTE } from "../../src/init/marked-block.js";
import { projectState } from "../../src/init/project-state.js";
import { provenanceLine, stampProvenance } from "../../src/init/provenance.js";
import { isSkillsInstalled, planRefresh } from "../../src/init/refresh-planner.js";
import { planUninstall, UNKNOWN_CARRIER } from "../../src/init/uninstall-planner.js";
import { FAKE_COORDINATE, fakeCarrier, fakePage } from "./fixtures.js";

/**
 * Uninstall removes exactly what the installer wrote and nothing beside it; refresh rewrites what is
 * already ours and starts nothing. These cases pin both halves of that promise.
 *
 * Named after `UninstallPlannerTest` and `RefreshPlannerTest` in the Java reference so the lists diff.
 */

const CARRIER = fakeCarrier(["a"]);
const OLDER = "@narrativetrace/skills@0.0.9";
const BLOCK = renderAgentsMdBlock(CARRIER, projectState());

function ourSkill(name = "a", coordinate = FAKE_COORDINATE) {
  return installedSkill(
    "agents",
    name,
    "ours",
    coordinate,
    `---\nname: ${name}\n---\n${provenanceLine(coordinate)}\n\nbody\n`,
  );
}

/** A skill directory holding exactly what `carrier` would install there — current in every sense. */
function currentSkill(carrier: Carrier, name: string) {
  const entry = carrier.catalogue.skills.find((skill) => skill.name === name);
  if (entry === undefined) throw new Error(`${name} is not in this carrier`);
  return installedSkill(
    "agents",
    name,
    "ours",
    carrier.coordinate,
    stampProvenance(carrierBody(carrier, entry, "agents"), carrier.coordinate),
  );
}

function actionFor(plan: { actions: readonly Action[] }, path: string): Action | undefined {
  return plan.actions.find((action) => action.path === path);
}

describe("the skill directories", () => {
  test("removes a skill page and then its directory", () => {
    const plan = planUninstall(projectState({ installedSkills: [ourSkill()] }));

    expect(plan.actions.map((action) => [action.kind, action.path])).toEqual([
      ["delete", ".agents/skills/a/SKILL.md"],
      ["delete-directory", ".agents/skills/a"],
    ]);
  });

  test("removes a skill installed from any carrier version", () => {
    const plan = planUninstall(projectState({ installedSkills: [ourSkill("a", OLDER)] }));

    expect(actionFor(plan, ".agents/skills/a/SKILL.md")?.kind).toBe("delete");
  });

  test("leaves a skill directory somebody else owns completely alone", () => {
    const state = projectState({
      installedSkills: [
        installedSkill("agents", "a", "foreign", "", "theirs\n"),
        installedSkill("claude", "b", "not-a-directory"),
      ],
    });

    expect(planUninstall(state).actions).toEqual([]);
  });
});

describe("the managed section", () => {
  test("removes the section and leaves the rest byte for byte", () => {
    const text = `# Title\n\n${BLOCK}\ntail\n`;

    const action = actionFor(planUninstall(projectState({ agentsMd: text })), AGENTS_MD);

    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe("# Title\n\ntail\n");
  });

  test("deletes a file the installer created once nothing of it is left", () => {
    const text = `${CREATED_NOTE}\n${BLOCK}`;

    const action = actionFor(planUninstall(projectState({ agentsMd: text })), AGENTS_MD);

    expect(action?.kind).toBe("delete");
    expect(action?.before).toBe(text);
  });

  // The blank line before "their own notes" is the SEPARATOR THAT PERSON TYPED, not ours: our own
  // separator, when there is one, sits BEFORE our section and goes with it. Removing exactly what the
  // installer wrote means leaving that line where it is.
  // "Nothing of it is left" means nothing a reader would see: a remainder of blank lines is empty, and
  // the file the installer created goes with it.
  test("deletes a file the installer created when only blank lines are left", () => {
    const text = `${CREATED_NOTE}\n${BLOCK}\n\n\n`;

    expect(actionFor(planUninstall(projectState({ agentsMd: text })), AGENTS_MD)?.kind).toBe(
      "delete",
    );
  });

  test("keeps a file the installer created once somebody else has written in it", () => {
    const text = `${CREATED_NOTE}\n${BLOCK}\ntheir own notes\n`;

    const action = actionFor(planUninstall(projectState({ agentsMd: text })), AGENTS_MD);

    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe("\ntheir own notes\n");
  });

  test("never deletes a file the installer only appended to", () => {
    const appended = actionFor(
      planUninstall(projectState({ agentsMd: `# Title\n\n${BLOCK}` })),
      AGENTS_MD,
    );
    const sectionOnly = actionFor(planUninstall(projectState({ agentsMd: BLOCK })), AGENTS_MD);

    expect(appended?.kind).toBe("replace");
    expect(appended?.after).toBe("# Title\n");
    // No created note, so the file is kept even though removing our section empties it.
    expect(sectionOnly?.kind).toBe("replace");
    expect(sectionOnly?.after).toBe("");
  });

  test("leaves a file with no section of ours alone", () => {
    expect(planUninstall(projectState({ agentsMd: "# Title\n" })).actions).toEqual([]);
  });

  test("refuses a file with two sections", () => {
    const plan = planUninstall(projectState({ agentsMd: `${BLOCK}\nx\n\n${BLOCK}` }));

    expect(actionFor(plan, AGENTS_MD)?.reason).toContain("remove it by hand");
    expect(planExitCode(plan)).toBe(1);
  });

  test("refuses a file whose markers do not pair up", () => {
    const plan = planUninstall(projectState({ agentsMd: "<!-- narrativetrace:end -->\n" }));

    expect(actionFor(plan, AGENTS_MD)?.kind).toBe("refuse");
  });

  test("removes our section from a vendor rule file but never the file", () => {
    const state = projectState({
      markedRuleFiles: new Map([[".cursorrules", `${CREATED_NOTE}\n${BLOCK}`]]),
    });

    const action = actionFor(planUninstall(state), ".cursorrules");

    expect(action?.kind).toBe("replace");
    expect(action?.after).toBe("");
  });
});

describe("the vendor context file", () => {
  test("removes the exact import line it added", () => {
    const action = actionFor(
      planUninstall(projectState({ claudeMd: "# Rules\n\n@AGENTS.md\n" })),
      CLAUDE_MD,
    );

    expect(action?.after).toBe("# Rules\n");
  });

  test("leaves a line that is not the exact line it added", () => {
    const state = projectState({ claudeMd: "# Rules\n\n@AGENTS.md   \n" });

    expect(actionFor(planUninstall(state), CLAUDE_MD)).toBeUndefined();
  });

  test("does nothing when there is no vendor context file", () => {
    expect(actionFor(planUninstall(projectState()), CLAUDE_MD)).toBeUndefined();
  });
});

describe("the plan's own shape", () => {
  test("removes only the half it was asked for", () => {
    const state = projectState({
      agentsMd: `# Title\n\n${BLOCK}`,
      installedSkills: [ourSkill()],
    });

    const skillsOnly = planUninstall(state, initOptions({ scope: "skills" }));
    const sectionOnly = planUninstall(state, initOptions({ scope: "agents-md" }));

    expect(skillsOnly.actions.every((action) => action.path.startsWith(".agents/"))).toBe(true);
    expect(sectionOnly.actions.map((action) => action.path)).toEqual([AGENTS_MD]);
  });

  test("names the carrier the project was installed from", () => {
    expect(planUninstall(projectState({ agentsMd: BLOCK })).carrier).toBe(FAKE_COORDINATE);
    expect(planUninstall(projectState({ installedSkills: [ourSkill("a", OLDER)] })).carrier).toBe(
      OLDER,
    );
  });

  test("reports the unknown carrier when the section carries no stamp", () => {
    const unstamped = "<!-- narrativetrace:start -->\nx\n<!-- narrativetrace:end -->\n";

    expect(planUninstall(projectState({ agentsMd: unstamped })).carrier).toBe(UNKNOWN_CARRIER);
    expect(planUninstall(projectState()).carrier).toBe(UNKNOWN_CARRIER);
  });

  test("an uninstall of nothing is an empty plan that exits zero", () => {
    const plan = planUninstall(projectState());

    expect(planIsEmpty(plan)).toBe(true);
    expect(planExitCode(plan)).toBe(0);
  });

  test("carries the dry-run flag", () => {
    expect(planUninstall(projectState(), initOptions({ dryRun: true })).dryRun).toBe(true);
  });

  test("refuses to plan without a snapshot or options", () => {
    expect(() => planUninstall(undefined as never)).toThrow(TypeError);
    expect(() => planUninstall(projectState(), null as never)).toThrow(TypeError);
  });
});

describe("a refresh", () => {
  test("plans nothing for a project that never ran init", () => {
    expect(planRefresh(projectState(), CARRIER).actions).toEqual([]);
  });

  test("rewrites a stale skill page in place", () => {
    const state = projectState({ installedSkills: [ourSkill("a", OLDER)] });

    const plan = planRefresh(state, CARRIER);

    expect(plan.actions.map((action) => [action.kind, action.path])).toEqual([
      ["replace", ".agents/skills/a/SKILL.md"],
    ]);
    expect(plan.carrier).toBe(FAKE_COORDINATE);
  });

  // `some`, not `every`: one stale page among current ones is still a stale install, and rewriting it
  // is the whole job. With `every` a project part-way through an upgrade would be left half-stale.
  test("rewrites the one stale page among pages that are already current", () => {
    const carrier = fakeCarrier(["a", "b"]);
    const state = projectState({
      installedSkills: [currentSkill(carrier, "a"), ourSkill("b", OLDER)],
    });

    const plan = planRefresh(state, carrier);

    expect(plan.actions.map((action) => action.path)).toEqual([".agents/skills/b/SKILL.md"]);
  });

  // A refresh plan is applied, never shown, so it is never a dry run — `applyPlan` throws on one.
  test("is never a dry run", () => {
    const state = projectState({ installedSkills: [ourSkill("a", OLDER)] });

    expect(planRefresh(state, CARRIER).dryRun).toBe(false);
  });

  test("plans nothing when every installed skill already carries the carrier's coordinate", () => {
    const state = projectState({ installedSkills: [ourSkill()] });

    expect(planRefresh(state, CARRIER).actions).toEqual([]);
  });

  test("leaves a page alone when its stamp matches, however it has been edited", () => {
    const edited = installedSkill(
      "agents",
      "a",
      "ours",
      FAKE_COORDINATE,
      `---\n---\n${provenanceLine(FAKE_COORDINATE)}\n\nhand-edited\n`,
    );

    expect(planRefresh(projectState({ installedSkills: [edited] }), CARRIER).actions).toEqual([]);
  });

  test("never creates a skill the project does not have", () => {
    const state = projectState({ installedSkills: [ourSkill("a", OLDER)] });

    const paths = planRefresh(state, fakeCarrier(["a", "b"])).actions.map((action) => action.path);

    expect(paths).not.toContain(".agents/skills/b/SKILL.md");
  });

  test("never appends a section to an AGENTS.md that carries none, and never adds the import line", () => {
    const state = projectState({
      agentsMd: "# Title\n",
      claudeMd: "# Rules\n",
      installedSkills: [ourSkill("a", OLDER)],
    });

    const paths = planRefresh(state, CARRIER).actions.map((action) => action.path);

    expect(paths).toEqual([".agents/skills/a/SKILL.md"]);
  });

  test("rewrites our own section beside the pages", () => {
    const state = projectState({
      agentsMd: `# Title\n\n${renderAgentsMdBlock(fakeCarrier(["a"], OLDER), projectState())}`,
      installedSkills: [ourSkill("a", OLDER)],
    });

    const plan = planRefresh(state, CARRIER);

    expect(actionFor(plan, AGENTS_MD)?.kind).toBe("replace");
    expect(actionFor(plan, AGENTS_MD)?.after).toBe(`# Title\n\n${BLOCK}`);
  });

  test("never touches a skill directory somebody else owns, and never carries a refusal", () => {
    const state = projectState({
      agentsMd: "# Title\n",
      installedSkills: [
        ourSkill("a", OLDER),
        installedSkill("agents", "theirs", "foreign", "", "not ours\n"),
      ],
    });

    const plan = planRefresh(state, CARRIER);

    expect(plan.actions.every((action) => action.kind === "replace")).toBe(true);
    expect(actionFor(plan, ".agents/skills/theirs")).toBeUndefined();
    expect(planExitCode(plan)).toBe(0);
  });

  test("knows whether a project carries an install of ours at all", () => {
    expect(isSkillsInstalled(projectState())).toBe(false);
    expect(isSkillsInstalled(projectState({ installedSkills: [ourSkill()] }))).toBe(true);
  });

  test("a skill directory somebody else owns is not an install of ours", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "narrativetrace-doctor", "foreign", "", "x\n")],
    });

    expect(isSkillsInstalled(state)).toBe(false);
  });

  test("refuses to answer or plan without a state or a carrier", () => {
    expect(() => isSkillsInstalled(undefined as never)).toThrow(TypeError);
    expect(() => planRefresh(undefined as never, CARRIER)).toThrow(TypeError);
    expect(() => planRefresh(projectState(), undefined as never)).toThrow(TypeError);
  });

  test("a page edited by hand under the SAME stamp is left alone, and a fake carrier proves it", () => {
    const state = projectState({ installedSkills: [ourSkill()] });

    expect(planRefresh(state, CARRIER).actions).toEqual([]);
    expect(fakePage("a", "agents")).toContain("# a (agents)");
  });
});
