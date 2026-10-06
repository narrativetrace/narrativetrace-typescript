// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The carrier's index: which runtime shipped it, and which skills it carries in which rendered
 * flavours.
 *
 * INTENT: the whole of `catalogue.json`, validated once at read time, so every later stage —
 * planner, renderer, executor — can treat it as a fact rather than as input.
 *
 * @llmNote The catalogue deliberately carries NO version: the carrier package's own version is the
 * stamp, so a checked-in catalogue never drifts from the artifact that ships it.
 */

/**
 * The two rendered forms of the same skill the carrier ships.
 *
 * @llmNote The two differ by two frontmatter fields, so the carrier ships both rather than making
 * the installer synthesise one from the other — rendering belongs in the catalogue package, not in
 * the installer. `agents` is written into every project; `claude` only where a project is detected
 * as that vendor's, or where the caller asked for it explicitly (the planner owns that decision).
 */
export type SkillFlavour = "agents" | "claude";

/** Both flavours, in the order a plan reads them. */
export const SKILL_FLAVOURS: readonly SkillFlavour[] = Object.freeze(["agents", "claude"] as const);

/** The project-relative directory a flavour's skill directories live in. */
export function installRootOf(flavour: SkillFlavour): string {
  return flavour === "agents" ? ".agents/skills" : ".claude/skills";
}

/**
 * One skill as the carrier's `catalogue.json` lists it: the name that becomes a directory in the
 * consumer project, the description an always-on agent pointer repeats verbatim, and the
 * carrier-relative path of each rendered flavour.
 *
 * INTENT: the installer's unit of work. Everything the planner needs about a skill is here, so a
 * plan can be computed without opening the carrier a second time.
 *
 * @llmNote The two paths are carrier-relative and always use `/`, never the platform separator:
 * they are entry names inside a published package first and filesystem paths second.
 */
export interface SkillEntry {
  /** The skill's directory name, unique within a catalogue. */
  readonly name: string;
  /** The one-paragraph trigger description, copied into the managed block as-is. */
  readonly description: string;
  /** Carrier-relative path of the open-standard flavour. */
  readonly agentsPath: string;
  /** Carrier-relative path of the vendor flavour. */
  readonly claudePath: string;
}

/**
 * The carrier's whole index.
 *
 * @param runtime the runtime slug the carrier was rendered for, `typescript` here
 * @param skills every skill in catalogue order, each name appearing exactly once
 */
export interface SkillCatalogue {
  readonly runtime: string;
  readonly skills: readonly SkillEntry[];
}

function requireText(value: string, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`a catalogue skill's ${what} must not be blank`);
  }
  return value;
}

/**
 * A validated, frozen catalogue entry.
 *
 * @throws {TypeError} when any of the four fields is blank.
 */
export function skillEntry(
  name: string,
  description: string,
  agentsPath: string,
  claudePath: string,
): SkillEntry {
  return Object.freeze({
    name: requireText(name, "name"),
    description: requireText(description, "description"),
    agentsPath: requireText(agentsPath, "agents path"),
    claudePath: requireText(claudePath, "claude path"),
  });
}

/** The carrier-relative path of one flavour's rendered page. */
export function pathFor(skill: SkillEntry, flavour: SkillFlavour): string {
  return flavour === "agents" ? skill.agentsPath : skill.claudePath;
}

function requireDistinctNames(skills: readonly SkillEntry[]): void {
  const names = skills.map((skill) => skill.name);
  if (new Set(names).size !== names.length) {
    throw new TypeError(`a catalogue names a skill twice: ${[...names].sort().join(", ")}`);
  }
}

/**
 * A validated, frozen catalogue.
 *
 * @throws {TypeError} when the runtime is blank, the skill list is empty, or a name repeats.
 */
export function skillCatalogue(runtime: string, skills: readonly SkillEntry[]): SkillCatalogue {
  if (typeof runtime !== "string" || runtime.trim() === "") {
    throw new TypeError("a catalogue's runtime must not be blank");
  }
  if (skills.length === 0) throw new TypeError("a catalogue must list at least one skill");
  requireDistinctNames(skills);
  return Object.freeze({ runtime, skills: Object.freeze([...skills]) });
}

/** The entry with this name, or `undefined` — the lookup an installer does per target directory. */
export function skillNamed(catalogue: SkillCatalogue, name: string): SkillEntry | undefined {
  return catalogue.skills.find((skill) => skill.name === name);
}
