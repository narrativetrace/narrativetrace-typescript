// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type Action,
  adoptPage,
  appendBlock,
  appendLine,
  createFile,
  isFileEdit,
  refuse,
  replaceBlock,
  replaceLink,
} from "./action.js";
import { isAdoptable } from "./adoption.js";
import { renderAgentsMdBlock } from "./agents-md-block.js";
import { type Carrier, carrierBody } from "./carrier.js";
import { type InitOptions, includesAgentsMd, includesSkills, initOptions } from "./init-options.js";
import { type InitPlan, initPlan } from "./init-plan.js";
import {
  type InstalledSkill,
  isLinkedPresence,
  linkedAtOf,
  skillDirectoryOf,
  skillPageOf,
} from "./installed-skill.js";
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
import { installedSkillAt, linkedInstallRootOf, type ProjectState } from "./project-state.js";
import { coordinateIn, stampProvenance } from "./provenance.js";
import {
  installRootOf,
  SKILL_FLAVOURS,
  type SkillEntry,
  type SkillFlavour,
} from "./skill-catalogue.js";

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

/**
 * What the carrier renders for one skill path, and what would be written there: the three texts every
 * decision about that path needs, so no decision takes six arguments to reach.
 */
interface PageWrite {
  /** The project-relative page path. */
  readonly path: string;
  /** The carrier's rendering for this flavour, unstamped — what adoption compares against. */
  readonly rendered: string;
  /** The same page with this carrier's provenance line — what gets written. */
  readonly content: string;
  /**
   * This skill's rendering in EVERY flavour, unstamped. A link at the vendor path points at the
   * open-standard page, so deciding about a link means comparing against both.
   */
  readonly renderings: readonly string[];
}

/**
 * A directory somebody else's tool wrote. A page equal to what this carrier renders is ADOPTED — it is
 * our own page, installed by a registry rather than by us, so stamping it takes nothing from anybody.
 * Anything else is a refusal until `--force` says otherwise.
 *
 * @llmNote Adoption is reached BEFORE the force check on purpose (rule 21): a `--force` run over a
 * registry tree adopts rather than overwrites, so the dangerous combination behaves like the safe one.
 */
function foreign(options: InitOptions, installed: InstalledSkill, page: PageWrite): Action {
  const directory = skillDirectoryOf(installed.flavour, installed.name);
  if (isAdoptable(installed.body, page.rendered)) {
    return adoptPage(page.path, installed.body, page.content);
  }
  if (!options.force) {
    return refuse(
      directory,
      `${directory} was not installed by narrativetrace — re-run with --force to overwrite this` +
        " skill, or move the directory aside",
    );
  }
  return write(page.path, installed.body, page.content);
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

/**
 * Whether a page reached through a link is one this install would own anyway: already stamped, or
 * identical to what this carrier renders for EITHER flavour. Either flavour, because the link a
 * registry leaves at the vendor path points at the open-standard page.
 */
function isOursOrAdoptable(body: string, renderings: readonly string[]): boolean {
  if (coordinateIn(body) !== undefined) return true;
  return renderings.some((rendered) => isAdoptable(body, rendered));
}

/** Why a link was refused: the link, where it goes, and what to do about it. */
function refuseLink(at: string, installed: InstalledSkill, tail: string): Action {
  return refuse(at, `${at} is a symbolic link to ${installed.link}${tail}`);
}

/**
 * A symbolic link where a skill's directory or page belongs. Writing through it would land in whatever
 * it points at — after `npx skills add`, the OTHER flavour's page — so the link itself is replaced
 * whenever what it reaches is a page this install owns or would adopt, and refused otherwise. No flag
 * appears here (rule 19): `--force` covers foreign CONTENT, and a link is structure.
 */
function linked(installed: InstalledSkill, page: PageWrite): Action {
  const at = linkedAtOf(installed);
  if (installed.body === "") {
    return refuseLink(
      at,
      installed,
      ", and there is no page of narrativetrace's at the other end — remove the link and run the" +
        " install again",
    );
  }
  if (!isOursOrAdoptable(installed.body, page.renderings)) {
    return refuseLink(
      at,
      installed,
      ", a page narrativetrace did not install — remove the link and run the install again; --force" +
        " covers content, never a link",
    );
  }
  return replaceLink(at, page.path, installed.link, page.content);
}

/** What to do about a skill path that already holds something. */
function actionForExisting(
  installed: InstalledSkill,
  options: InitOptions,
  page: PageWrite,
): Action {
  const directory = skillDirectoryOf(installed.flavour, installed.name);
  if (installed.presence === "not-a-directory") {
    return refuse(
      directory,
      `${directory} is not a directory — move it aside and run the install again`,
    );
  }
  if (isLinkedPresence(installed.presence)) return linked(installed, page);
  if (installed.presence === "ours") return write(page.path, installed.body, page.content);
  return foreign(options, installed, page);
}

function skillAction(
  state: ProjectState,
  carrier: Carrier,
  options: InitOptions,
  skill: SkillEntry,
  flavour: SkillFlavour,
): Action {
  const rendered = carrierBody(carrier, skill, flavour);
  const page: PageWrite = {
    path: skillPageOf(flavour, skill.name),
    rendered,
    content: stampProvenance(rendered, carrier.coordinate),
    renderings: SKILL_FLAVOURS.map((each) => carrierBody(carrier, skill, each)),
  };
  const installed = installedSkillAt(state, flavour, skill.name);
  return installed === undefined
    ? createFile(page.path, page.content)
    : actionForExisting(installed, options, page);
}

/**
 * The refusal a whole linked install root gets — once, rather than once per skill (rule 20): one link
 * is one decision, and a refusal per skill would also put several actions on the one path a plan
 * allows only one of.
 */
function refuseLinkedRoot(flavour: SkillFlavour, target: string): Action {
  const root = installRootOf(flavour);
  return refuse(
    root,
    `${root} is a symbolic link to ${target} — every skill of this flavour would be written through` +
      " it; remove the link, or run the install where it points",
  );
}

/** The flavours anything may be written into, and a refusal for each whose root is a link. */
function writableFlavours(
  state: ProjectState,
  options: InitOptions,
  actions: Action[],
): SkillFlavour[] {
  const writable: SkillFlavour[] = [];
  for (const flavour of flavoursFor(state, options)) {
    const linkedTo = linkedInstallRootOf(state, flavour);
    if (linkedTo === undefined) writable.push(flavour);
    else actions.push(refuseLinkedRoot(flavour, linkedTo));
  }
  return writable;
}

function planSkills(state: ProjectState, carrier: Carrier, options: InitOptions): Action[] {
  const actions: Action[] = [];
  const writable = writableFlavours(state, options, actions);
  for (const skill of carrier.catalogue.skills) {
    for (const flavour of writable) {
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
