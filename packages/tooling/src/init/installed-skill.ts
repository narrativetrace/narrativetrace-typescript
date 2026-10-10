// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { installRootOf, type SkillFlavour } from "./skill-catalogue.js";

/**
 * One skill directory found in a consumer project, and what the installer is allowed to do with it.
 *
 * INTENT: the planner's decision for a skill is a function of this record alone — is the directory
 * ours (overwrite, no flag), somebody else's (refuse unless forced), a symbolic link (replace the
 * link, or refuse — never write through it), or not a directory at all (refuse, always).
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
  | "not-a-directory"
  /** The skill's directory is a symbolic link; what a registry leaves at the vendor path. */
  | "linked-directory"
  /** The directory is real, and its `SKILL.md` is a symbolic link. */
  | "linked-page";

/** Whether this presence is one of the two the installer must not write through. */
export function isLinkedPresence(presence: SkillPresence): boolean {
  return presence === "linked-directory" || presence === "linked-page";
}

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
  /**
   * The current `SKILL.md` text; `""` when there is none. For a link, the page it reaches INSIDE the
   * project — and `""` when it reaches none, which is what a dangling link and a link out of the
   * project both come to.
   */
  readonly body: string;
  /**
   * What the symbolic link points at, exactly as the filesystem reports it; `""` unless the presence
   * is one of the two linked ones.
   */
  readonly link: string;
}

/**
 * A validated, frozen record of what is at one skill path.
 *
 * @throws {TypeError} when the name is blank, an install of ours carries no coordinate, or a link is
 * named without a linked presence or a linked presence without its link.
 */
export function installedSkill(
  flavour: SkillFlavour,
  name: string,
  presence: SkillPresence,
  coordinate = "",
  body = "",
  link = "",
): InstalledSkill {
  if (name.trim() === "") throw new TypeError("an installed skill's name must not be blank");
  if (presence === "ours" && coordinate.trim() === "") {
    throw new TypeError("an installed skill of ours carries its coordinate");
  }
  if (isLinkedPresence(presence) === (link.trim() === "")) {
    throw new TypeError(
      "a linked presence names what the link points at, and only a linked one does",
    );
  }
  return Object.freeze({ flavour, name, presence, coordinate, body, link });
}

/** The project-relative directory, e.g. `.agents/skills/narrativetrace-doctor`. */
export function skillDirectoryOf(flavour: SkillFlavour, name: string): string {
  return `${installRootOf(flavour)}/${name}`;
}

/** The project-relative page, e.g. `.agents/skills/narrativetrace-doctor/SKILL.md`. */
export function skillPageOf(flavour: SkillFlavour, name: string): string {
  return `${skillDirectoryOf(flavour, name)}/${SKILL_PAGE}`;
}

/**
 * Where the symbolic link itself sits: the skill's directory, or its page.
 *
 * @throws {TypeError} when nothing here is a link — a caller reading a field that has no meaning,
 * rather than a project in a strange state.
 */
export function linkedAtOf(skill: InstalledSkill): string {
  if (!isLinkedPresence(skill.presence)) {
    throw new TypeError(`nothing links to ${skillDirectoryOf(skill.flavour, skill.name)}`);
  }
  return skill.presence === "linked-page"
    ? skillPageOf(skill.flavour, skill.name)
    : skillDirectoryOf(skill.flavour, skill.name);
}
