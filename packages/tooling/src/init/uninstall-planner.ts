// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type Action, deleteDirectory, deleteFile, refuse, replaceBlock } from "./action.js";
import { type InitOptions, includesAgentsMd, includesSkills, initOptions } from "./init-options.js";
import { type InitPlan, initPlan } from "./init-plan.js";
import { AGENTS_MD, CLAUDE_MD, IMPORT_LINE } from "./init-planner.js";
import { skillDirectoryOf, skillPageOf } from "./installed-skill.js";
import {
  CREATED_NOTE,
  hasExactlyOneRegion,
  lineIs,
  removeLine,
  removeRegion,
  scanMarkedBlocks,
} from "./marked-block.js";
import type { ProjectState } from "./project-state.js";

/**
 * Decides what an uninstall would remove — exactly what the installer wrote, and nothing beside it.
 *
 * INTENT: the other half of the promise that makes an install safe to try. A skill directory is removed
 * only when its page carries our provenance line, whatever carrier stamped it; the managed section is
 * removed from its markers out; the import line is removed only when it is still character for
 * character the line the installer added.
 *
 * @llmNote A file is DELETED only when the installer created it (the `narrativetrace:created` note on
 * its first line) and nothing but our own content is left in it. A file the installer merely appended
 * to is always kept, even if removing our section empties it.
 *
 * @llmNote It also never FOLLOWS a link out of the project (design D5's amendment to this rule). Only a
 * presence of `ours` is ever planned, and a linked path is never that however stamped the page at the
 * far end is: a registry's files — its lock file, its pages behind a link — are left exactly as they
 * were, and deleting through the link would take the other flavour's page with it.
 *
 * @sideEffects None. Pure, like the install planner.
 */

/** What an uninstall reports as its carrier when the project carries no stamp at all. */
export const UNKNOWN_CARRIER = "@narrativetrace/skills@unknown";

/** The page first, then the directory it was the only reason for. */
function planSkills(state: ProjectState): Action[] {
  const actions: Action[] = [];
  for (const skill of state.installedSkills) {
    if (skill.presence !== "ours") continue;
    actions.push(deleteFile(skillPageOf(skill.flavour, skill.name), skill.body));
    actions.push(deleteDirectory(skillDirectoryOf(skill.flavour, skill.name)));
  }
  return actions;
}

function removeSection(path: string, text: string, mayDelete: boolean): Action[] {
  const scan = scanMarkedBlocks(text);
  if (scan.regions.length === 0 && scan.problems.length === 0) return [];
  if (!hasExactlyOneRegion(scan)) {
    return [
      refuse(path, `${path} does not carry exactly one NarrativeTrace section — remove it by hand`),
    ];
  }
  const withoutSection = removeRegion(text, scan.regions[0] as never);
  const created = lineIs(withoutSection, CREATED_NOTE);
  const remainder = created === undefined ? withoutSection : removeLine(withoutSection, created);
  if (mayDelete && created !== undefined && remainder.trim() === "") {
    return [deleteFile(path, text)];
  }
  return [replaceBlock(path, text, remainder)];
}

function planAgentsMd(state: ProjectState): Action[] {
  return state.agentsMd === undefined ? [] : removeSection(AGENTS_MD, state.agentsMd, true);
}

/** A rule file is never deleted: the installer never created one. */
function planRuleFiles(state: ProjectState): Action[] {
  return [...state.markedRuleFiles].flatMap(([path, text]) => removeSection(path, text, false));
}

function planClaudeMd(state: ProjectState): Action[] {
  const text = state.claudeMd;
  if (text === undefined) return [];
  const line = lineIs(text, IMPORT_LINE);
  return line === undefined ? [] : [replaceBlock(CLAUDE_MD, text, removeLine(text, line))];
}

/**
 * The coordinate this project was installed from: the stamp on the managed section, else the one on the
 * first skill of ours, else an honest `unknown`.
 */
function installedCoordinate(state: ProjectState): string {
  const scan = state.agentsMd === undefined ? undefined : scanMarkedBlocks(state.agentsMd);
  const fromSection =
    scan !== undefined && hasExactlyOneRegion(scan) ? scan.regions[0]?.coordinate : "";
  if (fromSection !== undefined && fromSection !== "") return fromSection;
  const fromSkill = state.installedSkills.find((skill) => skill.presence === "ours")?.coordinate;
  return fromSkill ?? UNKNOWN_CARRIER;
}

/**
 * The plan an uninstall with these options would apply to this project.
 *
 * @throws {TypeError} when the snapshot or the options are missing.
 */
export function planUninstall(state: ProjectState, options: InitOptions = initOptions()): InitPlan {
  if (state == null || options == null) {
    throw new TypeError("planning an uninstall needs a project state and options");
  }
  const actions: Action[] = [];
  if (includesSkills(options.scope)) actions.push(...planSkills(state));
  if (includesAgentsMd(options.scope)) {
    actions.push(...planAgentsMd(state), ...planClaudeMd(state), ...planRuleFiles(state));
  }
  return initPlan(installedCoordinate(state), options.dryRun, actions);
}
