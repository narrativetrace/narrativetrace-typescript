// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "../doctor/types.js";
import { resolvePackageJson } from "../package-resolution.js";
import { isDirectory, readTextFile } from "./files.js";
import { type InstalledSkill, installedSkill, SKILL_PAGE } from "./installed-skill.js";
import { scanMarkedBlocks } from "./marked-block.js";
import { DEFAULT_OUTPUT_DIRECTORY, type ProjectState, projectState } from "./project-state.js";
import { coordinateIn } from "./provenance.js";
import { installRootOf, SKILL_FLAVOURS, type SkillFlavour } from "./skill-catalogue.js";

/**
 * Builds a {@link ProjectState} from a real project directory: read-only, zero network, a bounded
 * listing of each install root.
 *
 * INTENT: the installer's single reader. Every file the planner reasons about is read here, once, so
 * nothing downstream touches the project until the executor writes.
 *
 * @llmNote Unlike the doctor's snapshot, this reader is NOT best-effort. A file that exists but cannot
 * be read is a hard failure, because "unreadable" and "absent" lead to opposite plans — absent means
 * create, and creating over a file we could not read would destroy it.
 *
 * @sideEffects Reads. Never writes, never creates a directory.
 */

/** Vendor rule files whose existing managed block is kept up to date, never created. */
const RULE_FILES = [".cursorrules", ".github/copilot-instructions.md"];

/** Where a project states its own trace output directory, in the precedence the runtime uses. */
const CONFIG_FILES = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js"];

/** `outputDir: "traces"`, and nothing whose key merely ENDS with those letters. */
const OUTPUT_DIRECTORY_IN_CONFIG = /(?<![\w$])outputDir\s*:\s*["']([^"']+)["']/;

/** The package whose installed version IS this project's NarrativeTrace release (D4). */
const FAMILY_PACKAGE = "@narrativetrace/core";

/** A listing cap, so a pathological tree degrades to a partial read rather than to a hang. */
export const DEFAULT_MAX_SKILL_DIRECTORIES = 200;

function carriesMarkers(content: string): boolean {
  const scan = scanMarkedBlocks(content);
  return scan.regions.length > 0 || scan.problems.length > 0;
}

function markedRuleFilesIn(projectDirectory: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const relative of RULE_FILES) {
    const content = readTextFile(join(projectDirectory, relative));
    if (content !== undefined && carriesMarkers(content)) found.set(relative, content);
  }
  return found;
}

function skillAt(flavour: SkillFlavour, root: string, name: string): InstalledSkill {
  const directory = join(root, name);
  if (!isDirectory(directory)) return installedSkill(flavour, name, "not-a-directory");
  const page = readTextFile(join(directory, SKILL_PAGE)) ?? "";
  const coordinate = coordinateIn(page);
  return coordinate === undefined
    ? installedSkill(flavour, name, "foreign", "", page)
    : installedSkill(flavour, name, "ours", coordinate, page);
}

/**
 * Every agent-skill directory found under either install root, in read order.
 *
 * @llmNote Exported for the doctor's {@link buildSnapshot} (environment.ts) to reuse directly —
 * one reader of a project's skill directories, so the doctor and `init` can never disagree about
 * which page is ours.
 */
export function installedSkillsIn(projectDirectory: string, max: number): InstalledSkill[] {
  const skills: InstalledSkill[] = [];
  for (const flavour of SKILL_FLAVOURS) {
    const root = join(projectDirectory, installRootOf(flavour));
    if (!isDirectory(root)) continue;
    for (const name of readdirSync(root).sort().slice(0, max)) {
      skills.push(skillAt(flavour, root, name));
    }
  }
  return skills;
}

/**
 * Where this project's traces land: what a config file states, else the environment, else the
 * default — the same precedence `@narrativetrace/vitest` itself applies at run time.
 */
function outputDirectoryOf(projectDirectory: string, env: Env): string {
  for (const config of CONFIG_FILES) {
    const stated = OUTPUT_DIRECTORY_IN_CONFIG.exec(
      readTextFile(join(projectDirectory, config)) ?? "",
    );
    if (stated?.[1] !== undefined) return stated[1];
  }
  const fromEnv = env.NARRATIVETRACE_OUTPUT_DIR?.trim();
  return fromEnv === undefined || fromEnv === "" ? DEFAULT_OUTPUT_DIRECTORY : fromEnv;
}

/**
 * Reads a project directory.
 *
 * @param projectDirectory the consumer project's root
 * @param env the environment its runs would see, for the output-directory override
 * @param maxSkillDirectories listing cap per install root
 * @throws {TypeError} when the path is not a directory.
 */
export function readProjectState(
  projectDirectory: string,
  env: Env = {},
  maxSkillDirectories = DEFAULT_MAX_SKILL_DIRECTORIES,
): ProjectState {
  if (!isDirectory(projectDirectory)) {
    throw new TypeError(`${projectDirectory} is not a directory`);
  }
  return projectState({
    agentsMd: readTextFile(join(projectDirectory, "AGENTS.md")),
    claudeMd: readTextFile(join(projectDirectory, "CLAUDE.md")),
    claudeDirectory: isDirectory(join(projectDirectory, ".claude")),
    installedSkills: installedSkillsIn(projectDirectory, maxSkillDirectories),
    markedRuleFiles: markedRuleFilesIn(projectDirectory),
    outputDirectory: outputDirectoryOf(projectDirectory, env),
    projectVersion: resolvePackageJson(FAMILY_PACKAGE, projectDirectory)?.version,
  });
}
