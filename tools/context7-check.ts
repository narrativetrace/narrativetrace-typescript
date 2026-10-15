// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import Ajv from "ajv";
import { publicDocuments } from "./public-documents.js";

// Context7 (https://context7.com) indexes a public repository's documentation and serves its code
// blocks to coding agents. `context7.json` at the repository root tells it where to look. This
// module is the gate behind that file — three offline checks, no network:
//   1. the file validates against a committed copy of Context7's own JSON schema
//      (`tools/context7-schema.json`, fetch date in `tools/context7-schema.fetched`; refreshing it
//      is a manual step, see documentation/agent-skills.md),
//   2. `previousVersions` is exactly the repository's `v*` tags, derived and never typed,
//   3. every code fence in the files Context7 will index carries a language tag (an untagged block
//      indexes as prose).

/** The subset of `context7.json` the gate reads. */
export interface Context7Config {
  folders?: string[];
  excludeFolders?: string[];
  excludeFiles?: string[];
  previousVersions?: Array<string | { tag?: string; branch?: string }>;
}

/** One opening code fence with no language tag: root-relative path and 1-based line number. */
export interface UntaggedFence {
  file: string;
  line: number;
}

const FENCE = /^ {0,}(`{3,}|~{3,})(.*)$/;

/** Schema violations of `config` against `schema`, as readable `path: message` lines; empty when valid. */
export function schemaViolations(config: unknown, schema: object): string[] {
  const validate = new Ajv({ strict: false, validateFormats: false }).compile(schema);
  if (validate(config)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"}: ${e.message}`);
}

/** The `v*` tags of the repository at `repoRoot`, newest first (`--sort=-v:refname`). */
export function versionTags(repoRoot: string): string[] {
  const out = execFileSync("git", ["tag", "--list", "v*", "--sort=-v:refname"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return out.split("\n").filter((tag) => tag !== "");
}

/** `previousVersions` entries as tags; a branch entry has no tag and is reported as `branch:<name>`. */
export function declaredTags(config: Context7Config): string[] {
  return (config.previousVersions ?? []).map((entry) => {
    if (typeof entry === "string") return entry;
    return entry.tag ?? `branch:${entry.branch}`;
  });
}

/** Differences between declared `previousVersions` and `tags`; empty when they are equal, in order. */
export function versionDrift(config: Context7Config, tags: string[]): string[] {
  const declared = declaredTags(config);
  const problems: string[] = [];
  for (const tag of tags)
    if (!declared.includes(tag)) problems.push(`tag ${tag} missing from previousVersions`);
  for (const tag of declared)
    if (!tags.includes(tag)) problems.push(`previousVersions names ${tag}, which is no v* tag`);
  if (problems.length === 0 && declared.join() !== tags.join())
    problems.push("previousVersions is not in tag order (newest first)");
  return problems;
}

function underFolder(rel: string, folder: string): boolean {
  const prefix = folder.replace(/\/+$/, "");
  return rel === prefix || rel.startsWith(`${prefix}/`);
}

/**
 * Whether Context7 indexes the repository-relative file `rel` under `config`: not under an
 * `excludeFolders` entry (checked first), not named in `excludeFiles`, and either a root-level file
 * (always included) or under a `folders` entry (every file, when `folders` is empty). Entries are
 * plain paths; glob entries are not interpreted.
 */
export function isIndexed(rel: string, config: Context7Config): boolean {
  if ((config.excludeFolders ?? []).some((folder) => underFolder(rel, folder))) return false;
  if ((config.excludeFiles ?? []).includes(rel.split("/").pop() ?? rel)) return false;
  const folders = config.folders ?? [];
  if (!rel.includes("/") || folders.length === 0) return true;
  return folders.some((folder) => underFolder(rel, folder));
}

/** 1-based line numbers of every opening fence in `text` whose info string is empty. */
export function untaggedFenceLines(text: string): number[] {
  const lines: number[] = [];
  let open: { char: string; length: number } | undefined;
  text.split("\n").forEach((raw, index) => {
    const match = FENCE.exec(raw.replace(/\r$/, ""));
    if (open === undefined) {
      if (match === null || (match[1][0] === "`" && match[2].includes("`"))) return;
      open = { char: match[1][0], length: match[1].length };
      if (match[2].trim() === "") lines.push(index + 1);
    } else if (
      match !== null &&
      match[1][0] === open.char &&
      match[1].length >= open.length &&
      match[2].trim() === ""
    ) {
      open = undefined;
    }
  });
  return lines;
}

/** Every untagged opening fence in the shipped files `config` lets Context7 index. */
export function untaggedFences(repoRoot: string, config: Context7Config): UntaggedFence[] {
  const found: UntaggedFence[] = [];
  for (const abs of publicDocuments(repoRoot)) {
    const rel = relative(repoRoot, abs);
    if (!isIndexed(rel, config)) continue;
    for (const line of untaggedFenceLines(readFileSync(abs, "utf-8")))
      found.push({ file: rel, line });
  }
  return found;
}

/** Loads `context7.json` and the committed schema from `repoRoot`. */
export function loadConfig(repoRoot: string): { config: Context7Config; schema: object } {
  return {
    config: JSON.parse(readFileSync(join(repoRoot, "context7.json"), "utf-8")),
    schema: JSON.parse(readFileSync(join(repoRoot, "tools/context7-schema.json"), "utf-8")),
  };
}
