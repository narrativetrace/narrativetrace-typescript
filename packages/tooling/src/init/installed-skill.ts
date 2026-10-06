// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { installRootOf, type SkillFlavour } from "./skill-catalogue.js";

/**
 * One skill directory found in a consumer project, and what the installer is allowed to do with it.
 *
 * INTENT: the planner's decision for a skill is a function of this record alone — is the directory
 * ours (overwrite, no flag), somebody else's (refuse unless forced), or not a directory at all
 * (refuse, always).
 */

/** The page's file name inside a skill directory — the same in every flavour. */
export const SKILL_PAGE = "SKILL.md";

/** What sits at a skill's path in the consumer project. */
export type SkillPresence =
  /** A directory whose `SKILL.md` carries our provenance line — an install of ours. */
  | "ours"
  /** A directory somebody else owns: no page, or a page without our provenance line. */
  | "foreign"
  /** Something that is not a directory at all sits at the path a skill needs. */
  | "not-a-directory";

/** A skill directory as the project currently has it. */
export interface InstalledSkill {
  /** Which install root it was found under. */
  readonly flavour: SkillFlavour;
  /** The directory name, which is the skill name. */
  readonly name: string;
  /** What was found there. */
  readonly presence: SkillPresence;
  /** The carrier a previous install stamped it with; `""` unless {@link presence} is `ours`. */
  readonly coordinate: string;
  /** The current `SKILL.md` text; `""` when there is none. */
  readonly body: string;
}

/**
 * A validated, frozen record of what is at one skill path.
 *
 * @throws {TypeError} when the name is blank, or an install of ours carries no coordinate.
 */
export function installedSkill(
  flavour: SkillFlavour,
  name: string,
  presence: SkillPresence,
  coordinate = "",
  body = "",
): InstalledSkill {
  if (name.trim() === "") throw new TypeError("an installed skill's name must not be blank");
  if (presence === "ours" && coordinate.trim() === "") {
    throw new TypeError("an installed skill of ours carries its coordinate");
  }
  return Object.freeze({ flavour, name, presence, coordinate, body });
}

/** The project-relative directory, e.g. `.agents/skills/narrativetrace-doctor`. */
export function skillDirectoryOf(flavour: SkillFlavour, name: string): string {
  return `${installRootOf(flavour)}/${name}`;
}

/** The project-relative page, e.g. `.agents/skills/narrativetrace-doctor/SKILL.md`. */
export function skillPageOf(flavour: SkillFlavour, name: string): string {
  return `${skillDirectoryOf(flavour, name)}/${SKILL_PAGE}`;
}
