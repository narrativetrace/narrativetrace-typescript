// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
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

/** What the installer knows about one consumer project. */
export interface ProjectState {
  /** The project's `AGENTS.md`, byte for byte, or `undefined` when it has none. */
  readonly agentsMd: string | undefined;
  /** The project's `CLAUDE.md`, byte for byte, or `undefined` when it has none. */
  readonly claudeMd: string | undefined;
  /** Whether the vendor directory exists — one half of the vendor-detection rule. */
  readonly claudeDirectory: boolean;
  /** Every skill directory found under either install root, in read order. */
  readonly installedSkills: readonly InstalledSkill[];
  /**
   * Vendor rule files that already carry our markers, by project-relative path. The installer never
   * CREATES one of these; it keeps an existing block up to date.
   */
  readonly markedRuleFiles: ReadonlyMap<string, string>;
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
 * A validated, frozen snapshot.
 *
 * @throws {TypeError} when one (flavour, name) is described twice, or the output directory is blank.
 */
export function projectState(input: ProjectStateInput = {}): ProjectState {
  const installedSkills = Object.freeze([...(input.installedSkills ?? [])]);
  requireOnePathOnce(installedSkills);
  const outputDirectory = input.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY;
  if (outputDirectory.trim() === "") {
    throw new TypeError("a project state names where traces land, never an empty directory");
  }
  return Object.freeze({
    agentsMd: input.agentsMd,
    claudeMd: input.claudeMd,
    claudeDirectory: input.claudeDirectory ?? false,
    installedSkills,
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
