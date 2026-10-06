// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type Action,
  appendBlock,
  appendLine,
  createFile,
  isFileEdit,
  refuse,
  replaceBlock,
} from "./action.js";
import { renderAgentsMdBlock } from "./agents-md-block.js";
import { type Carrier, carrierBody } from "./carrier.js";
import { type InitOptions, includesAgentsMd, includesSkills, initOptions } from "./init-options.js";
import { type InitPlan, initPlan } from "./init-plan.js";
import { type InstalledSkill, skillDirectoryOf, skillPageOf } from "./installed-skill.js";
import {
  CREATED_NOTE,
  endsInsideFence,
  eolOf,
  lineIsIgnoringTrailingSpace,
  type MarkedScan,
  replaceRegion,
  scanMarkedBlocks,
  withEol,
} from "./marked-block.js";
import { installedSkillAt, type ProjectState } from "./project-state.js";
import { stampProvenance } from "./provenance.js";
import { SKILL_FLAVOURS, type SkillEntry, type SkillFlavour } from "./skill-catalogue.js";

/**
 * Decides what an install would do — and nothing else.
 *
 * INTENT: a pure function of `(ProjectState, Carrier, InitOptions)`. Every existing-file policy lives
 * here and only here, which is why each row of it is a unit test with no filesystem at all, and why a
 * `--dry-run` diff is exactly what a real run would write.
 *
 * @llmNote An action whose result equals what is already there is dropped, so planning a project that
 * is already current yields an EMPTY plan. That is what makes a re-run idempotent, and it is the
 * property the round-trip properties lean on.
 *
 * @llmNote A refusal never stops the plan: the rest of the actions are still planned, and the run exits
 * 1. One bad file must not cost a project its other nine.
 *
 * @sideEffects None. Nothing here reads a file or writes one.
 */

/** The managed home, the one file the section is ever written into. */
export const AGENTS_MD = "AGENTS.md";

/** The vendor context file, which gets an import line and never a copy of the section. */
export const CLAUDE_MD = "CLAUDE.md";

/** The line that points the vendor's context file at the managed home. */
export const IMPORT_LINE = "@AGENTS.md";

/**
 * A file that ends inside an unfinished fenced code block cannot be appended to: whatever is added
 * lands inside that fence, invisible to this installer's own markers and to every Markdown reader, so
 * the next run would add it again.
 */
function unfinishedFence(path: string): string {
  return (
    `${path} ends inside an unfinished fenced code block — close the fence, and anything appended` +
    " after it will be read as text rather than as code"
  );
}

/** A write is a create when nothing is there and a replacement when something is. */
function write(page: string, current: string, content: string): Action {
  return current === "" ? createFile(page, content) : replaceBlock(page, current, content);
}

function foreign(
  options: InitOptions,
  directory: string,
  page: string,
  current: string,
  content: string,
): Action {
  if (!options.force) {
    return refuse(
      directory,
      `${directory} was not installed by narrativetrace — re-run with --force to overwrite this` +
        " skill, or move the directory aside",
    );
  }
  return write(page, current, content);
}

/**
 * Which flavours this project gets: the open standard always, the vendor one where the project looks
 * like that vendor's — or wherever the caller overrode the detection.
 */
function flavoursFor(state: ProjectState, options: InitOptions): readonly SkillFlavour[] {
  const vendor =
    options.vendorClaude === "on" ||
    (options.vendorClaude === "auto" && (state.claudeDirectory || state.claudeMd !== undefined));
  return vendor ? SKILL_FLAVOURS : ["agents"];
}

/** What to do about a skill path that already holds something. */
function actionForExisting(
  installed: InstalledSkill,
  options: InitOptions,
  page: string,
  content: string,
): Action {
  const directory = skillDirectoryOf(installed.flavour, installed.name);
  if (installed.presence === "not-a-directory") {
    return refuse(
      directory,
      `${directory} is not a directory — move it aside and run the install again`,
    );
  }
  if (installed.presence === "ours") return write(page, installed.body, content);
  return foreign(options, directory, page, installed.body, content);
}

function skillAction(
  state: ProjectState,
  carrier: Carrier,
  options: InitOptions,
  skill: SkillEntry,
  flavour: SkillFlavour,
): Action {
  const page = skillPageOf(flavour, skill.name);
  const content = stampProvenance(carrierBody(carrier, skill, flavour), carrier.coordinate);
  const installed = installedSkillAt(state, flavour, skill.name);
  return installed === undefined
    ? createFile(page, content)
    : actionForExisting(installed, options, page, content);
}

function planSkills(state: ProjectState, carrier: Carrier, options: InitOptions): Action[] {
  const actions: Action[] = [];
  for (const skill of carrier.catalogue.skills) {
    for (const flavour of flavoursFor(state, options)) {
      actions.push(skillAction(state, carrier, options, skill, flavour));
    }
  }
  return actions;
}

function twoOrMoreSections(path: string, scan: MarkedScan): string {
  const lines = scan.regions.map((region) => `line ${region.startLine}`).join(", ");
  return `${path} carries two or more NarrativeTrace sections (${lines}) — leave exactly one`;
}

/** The same decision for any file that may carry the section: our home and the rule files. */
function blockAction(path: string, text: string, block: string, mayWriteExisting: boolean): Action {
  const scan = scanMarkedBlocks(text);
  if (scan.problems.length > 0) return refuse(path, `${path}: ${scan.problems.join("; ")}`);
  if (scan.regions.length > 1) return refuse(path, twoOrMoreSections(path, scan));
  const matched = withEol(block, eolOf(text));
  const region = scan.regions[0];
  if (region !== undefined) return replaceBlock(path, text, replaceRegion(text, region, matched));
  if (!mayWriteExisting) {
    return refuse(
      path,
      `${path} exists and carries no NarrativeTrace section — re-run with --write-existing to` +
        " append one",
    );
  }
  if (endsInsideFence(text)) return refuse(path, unfinishedFence(path));
  return appendBlock(path, text, matched);
}

function planAgentsMd(state: ProjectState, carrier: Carrier, options: InitOptions): Action[] {
  const block = renderAgentsMdBlock(carrier, state);
  if (state.agentsMd === undefined) {
    return [createFile(AGENTS_MD, `${CREATED_NOTE}\n${block}`)];
  }
  return [blockAction(AGENTS_MD, state.agentsMd, block, options.writeExisting)];
}

function planClaudeMd(state: ProjectState, options: InitOptions): Action[] {
  const text = state.claudeMd;
  if (text === undefined || lineIsIgnoringTrailingSpace(text, IMPORT_LINE) !== undefined) return [];
  if (!options.writeExisting) {
    return [
      refuse(
        CLAUDE_MD,
        `${CLAUDE_MD} exists and does not import ${AGENTS_MD} — re-run with --write-existing to` +
          " add the one-line import",
      ),
    ];
  }
  if (endsInsideFence(text)) return [refuse(CLAUDE_MD, unfinishedFence(CLAUDE_MD))];
  return [appendLine(CLAUDE_MD, text, IMPORT_LINE)];
}

/**
 * A vendor rule file is never created and never appended to: an existing managed section in one is kept
 * current, and that is all.
 */
function planRuleFiles(state: ProjectState, carrier: Carrier): Action[] {
  const block = renderAgentsMdBlock(carrier, state);
  return [...state.markedRuleFiles].map(([path, text]) => blockAction(path, text, block, false));
}

/** Drops every action that would write what is already there. */
function withoutNoOps(actions: readonly Action[]): Action[] {
  return actions.filter((action) => !isFileEdit(action) || action.before !== action.after);
}

/**
 * The plan an install with these options would apply to this project.
 *
 * @throws {TypeError} when a snapshot or a carrier is missing.
 */
export function planInstall(
  state: ProjectState,
  carrier: Carrier,
  options: InitOptions = initOptions(),
): InitPlan {
  if (state == null || carrier == null || options == null) {
    throw new TypeError("planning needs a project state, a carrier and options");
  }
  const actions: Action[] = [];
  if (includesSkills(options.scope)) actions.push(...planSkills(state, carrier, options));
  if (includesAgentsMd(options.scope)) {
    actions.push(...planAgentsMd(state, carrier, options));
    actions.push(...planClaudeMd(state, options));
    actions.push(...planRuleFiles(state, carrier));
  }
  return initPlan(carrier.coordinate, options.dryRun, withoutNoOps(actions));
}
