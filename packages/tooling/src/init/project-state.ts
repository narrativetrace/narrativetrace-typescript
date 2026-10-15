// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { platformRowById } from "../platforms/platform-table.js";
import type { InstalledSkill } from "./installed-skill.js";
import type { SkillFlavour } from "./skill-catalogue.js";

/**
 * A read-only snapshot of a consumer project: everything the installer's decisions depend on, read
 * once and never read again.
 *
 * INTENT: makes the planner a pure function. Every "does this file exist", "is this directory ours",
 * "where do traces land" question is answered here, so a plan can be computed, printed as a diff,
 * reviewed, and only then applied — with no chance of the answer changing between the diff and the
 * write.
 *
 * Built two ways: {@link readProjectState} walks a real directory; a test builds one directly with
 * {@link projectState}, which is why every planner case is a unit test with no disk at all.
 *
 * @llmNote Contents are kept byte for byte — line endings, byte-order mark, missing final newline and
 * all. The planner's edits are expressed against exactly these bytes.
 */

/** Where rendered traces land when a project says nothing else. */
export const DEFAULT_OUTPUT_DIRECTORY = "narrativetrace-output";

/** Where a pointer path is blocked, and why — the refusal names `at`, which may be a directory above it. */
export interface UnwritablePointer {
  readonly at: string;
  readonly why: string;
}

/** What the installer knows about one consumer project. */
export interface ProjectState {
  /** The project's `AGENTS.md`, byte for byte, or `undefined` when it has none. */
  readonly agentsMd: string | undefined;
  /** The project's `CLAUDE.md`, byte for byte, or `undefined` when it has none. */
  readonly claudeMd: string | undefined;
  /** Whether the vendor directory exists. Read for the report; the planner no longer gates on it. */
  readonly claudeDirectory: boolean;
  /** Every skill directory found under either install root, in read order. */
  readonly installedSkills: readonly InstalledSkill[];
  /**
   * What a flavour's install root points at, for each root that is itself a symbolic link — nothing
   * may be written into that flavour at all, because every page of it, present or not, would land
   * wherever the link goes.
   */
  readonly linkedInstallRoots: ReadonlyMap<SkillFlavour, string>;
  /**
   * Vendor rule files that already carry our markers, by project-relative path. The installer never
   * CREATES one of these; it keeps an existing block up to date.
   */
  readonly markedRuleFiles: ReadonlyMap<string, string>;
  /**
   * The ids of the platform-table rows whose marker the project carries — `.cursor/`, `replit.md`, … —
   * read by exact path, so a near miss such as `.cursorx/` proves nothing.
   */
  readonly detectedPlatforms: ReadonlySet<string>;
  /**
   * Each platform pointer file that exists, byte for byte, by project-relative path. A path that runs
   * through a symbolic link is never here: see {@link pointersBehindLinks}.
   */
  readonly pointerFiles: ReadonlyMap<string, string>;
  /**
   * Pointer paths the installer cannot plan against, with why: a directory where the file belongs, a
   * file where a directory belongs, or bytes that are not UTF-8. Never in {@link pointerFiles}; a plan
   * REFUSES them, because creating over something it could not read would destroy it.
   */
  readonly pointersUnwritable: ReadonlyMap<string, UnwritablePointer>;
  /** Pointer paths where the file, or a directory above it, is a symbolic link — never read or written. */
  readonly pointersBehindLinks: ReadonlySet<string>;
  /** Where this project's rendered traces land, detected or {@link DEFAULT_OUTPUT_DIRECTORY}. */
  readonly outputDirectory: string;
  /**
   * The NarrativeTrace release this project resolves, or `undefined` when it resolves none (an empty
   * directory). D4's version guard compares it with the carrier's.
   */
  readonly projectVersion: string | undefined;
}

/** Everything a caller may set; every field has the "untouched project" default. */
export type ProjectStateInput = Partial<ProjectState>;

function requireOnePathOnce(installedSkills: readonly InstalledSkill[]): void {
  const keys = installedSkills.map((skill) => `${skill.flavour}/${skill.name}`);
  if (new Set(keys).size !== keys.length) {
    throw new TypeError(`a project state must describe one path once, got ${keys.join(", ")}`);
  }
}

/**
 * Nothing is listed under a flavour whose whole install root is a link: what was found there was found
 * THROUGH it, and the planner is never allowed to treat such a page as a path of its own.
 */
function requireNothingBehindALinkedRoot(
  installedSkills: readonly InstalledSkill[],
  linkedInstallRoots: ReadonlyMap<SkillFlavour, string>,
): void {
  const behind = installedSkills.filter((skill) => linkedInstallRoots.has(skill.flavour));
  if (behind.length > 0) {
    throw new TypeError(
      `a linked install root hides every skill under it, got ${behind
        .map((skill) => `${skill.flavour}/${skill.name}`)
        .join(", ")}`,
    );
  }
}

function requireKnownPlatforms(detected: ReadonlySet<string>): void {
  const unknown = [...detected].filter((id) => platformRowById(id) === undefined);
  if (unknown.length > 0) {
    throw new TypeError(
      `a project state names platform-table rows only, got ${unknown.join(", ")}`,
    );
  }
}

/** The platform half of a snapshot, copied so the caller's collections are never shared. */
function platformFieldsOf(
  input: ProjectStateInput,
): Pick<
  ProjectState,
  "detectedPlatforms" | "pointerFiles" | "pointersBehindLinks" | "pointersUnwritable"
> {
  const detectedPlatforms = new Set(input.detectedPlatforms ?? []);
  requireKnownPlatforms(detectedPlatforms);
  return {
    detectedPlatforms,
    pointerFiles: new Map(input.pointerFiles ?? []),
    pointersBehindLinks: new Set(input.pointersBehindLinks ?? []),
    pointersUnwritable: new Map(input.pointersUnwritable ?? []),
  };
}

function requireOutputDirectory(directory: string | undefined): string {
  const outputDirectory = directory ?? DEFAULT_OUTPUT_DIRECTORY;
  if (outputDirectory.trim() === "") {
    throw new TypeError("a project state names where traces land, never an empty directory");
  }
  return outputDirectory;
}

/**
 * A validated, frozen snapshot.
 *
 * @throws {TypeError} when one (flavour, name) is described twice, a skill is listed under a linked
 * install root, or the output directory is blank.
 */
export function projectState(input: ProjectStateInput = {}): ProjectState {
  const installedSkills = Object.freeze([...(input.installedSkills ?? [])]);
  const linkedInstallRoots = new Map(input.linkedInstallRoots ?? []);
  requireOnePathOnce(installedSkills);
  requireNothingBehindALinkedRoot(installedSkills, linkedInstallRoots);
  const outputDirectory = requireOutputDirectory(input.outputDirectory);
  return Object.freeze({
    ...platformFieldsOf(input),
    agentsMd: input.agentsMd,
    claudeMd: input.claudeMd,
    claudeDirectory: input.claudeDirectory ?? false,
    installedSkills,
    linkedInstallRoots,
    markedRuleFiles: new Map(input.markedRuleFiles ?? []),
    outputDirectory,
    projectVersion: input.projectVersion,
  });
}

/** The skill directory at one flavour's path, or `undefined` when nothing is there. */
export function installedSkillAt(
  state: ProjectState,
  flavour: SkillFlavour,
  name: string,
): InstalledSkill | undefined {
  return state.installedSkills.find((skill) => skill.flavour === flavour && skill.name === name);
}

/**
 * What this flavour's install root points at when the root itself is a symbolic link, or `undefined`
 * when it is a path of the project's own.
 */
export function linkedInstallRootOf(
  state: ProjectState,
  flavour: SkillFlavour,
): string | undefined {
  return state.linkedInstallRoots.get(flavour);
}
