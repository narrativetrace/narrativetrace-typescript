// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  OPENAI_PLUGIN_JSON_ENTRY,
  OPENAI_PLUGIN_ROOT,
  type OpenAiListingFields,
  openAiPackageEntries,
  pngDimensions,
  renderOpenAiPluginJson,
  type Skill,
} from "@narrativetrace/skills-catalogue";
import { readZip, writeZip, type ZipEntry } from "./zip-archive.js";

// The OpenAI plugin directory's package: a ZIP holding the packaged `plugin.json`, one
// `skills/<name>/SKILL.md` per free skill (the `.agents` flavour, byte-identical to the committed
// `.agents/skills/` pages the drift test pins) and the two listing assets. Built from a release tag
// by hand and uploaded by the owner — never per commit, never a release workflow step, never
// committed. The entry list is DERIVED from the catalogue (`openAiPackageEntries`) and ASSERTED
// against the built ZIP read back from disk (release rule 5: derived from the build, never a glob).

const SEMVER = /^\d+\.\d+\.\d+$/;
const MIN_ICON_PX = 48;
const MAX_ICON_BYTES = 5 * 1024 * 1024;
const PAGE_ROOT = ".agents/skills";

/** Throws `RangeError` unless `version` is `X.Y.Z` — the explicit semantic version a submission needs. */
export function assertSemanticVersion(version: string): void {
  if (!SEMVER.test(version)) {
    throw new RangeError(`version '${version}' is not semantic (X.Y.Z, no -SNAPSHOT)`);
  }
}

function isForbidden(entryName: string): boolean {
  const name = entryName.toLowerCase();
  return (
    name.startsWith("hooks/") ||
    name.startsWith("node_modules/") ||
    name === "mcp.json" ||
    name.endsWith(".app.json")
  );
}

function entrySetProblems(expected: readonly string[], actual: readonly string[]): string[] {
  const sorted = [...expected].sort();
  const same = sorted.length === actual.length && sorted.every((name, i) => name === actual[i]);
  const message = `entries do not match the layout — expected ${JSON.stringify(sorted)} but found ${JSON.stringify(actual)}`;
  return same ? [] : [message];
}

function versionProblems(manifest: Record<string, unknown>, expectedVersion: string): string[] {
  const problems: string[] = [];
  if (!SEMVER.test(expectedVersion)) {
    problems.push(`version '${expectedVersion}' is not semantic (X.Y.Z, no -SNAPSHOT)`);
  }
  const found = manifest.version;
  if (typeof found !== "string") {
    problems.push('plugin.json carries no "version" key');
  } else if (found !== expectedVersion) {
    problems.push(`plugin.json version '${found}' does not equal ${expectedVersion}`);
  }
  return problems;
}

function iconProblems(path: string, bytes: Buffer): string[] {
  if (bytes.length > MAX_ICON_BYTES) return [`${path} is larger than 5 MiB`];
  let size: { width: number; height: number };
  try {
    size = pngDimensions(bytes);
  } catch (error) {
    return [`${path} is not a readable PNG (${(error as Error).message})`];
  }
  if (size.width !== size.height) return [`${path} is not square (${size.width}x${size.height})`];
  if (size.width < MIN_ICON_PX) return [`${path} is smaller than 48px (${size.width}px)`];
  return [];
}

/** The `./`-relative paths the listing block names: its string values shaped like a path. */
function listingPaths(manifest: Record<string, unknown>): string[] {
  const extensions = manifest.extensions as Record<string, any> | undefined;
  const block: Record<string, unknown> = extensions?.["com.openai"]?.interface ?? {};
  return Object.values(block)
    .filter((value): value is string => typeof value === "string" && /^\.\/\S+$/.test(value))
    .map((value) => value.slice(2));
}

function manifestPathProblems(
  manifest: Record<string, unknown>,
  files: ReadonlyMap<string, Buffer>,
): string[] {
  const problems: string[] = [];
  for (const path of listingPaths(manifest)) {
    const bytes = files.get(path);
    if (bytes === undefined) {
      problems.push(`manifest path './${path}' resolves to no packaged entry`);
    } else if (path.toLowerCase().endsWith(".png")) {
      problems.push(...iconProblems(path, bytes));
    }
  }
  return problems;
}

/**
 * Opens a built ZIP and returns every way it departs from the catalogue-derived package: the entry
 * set must EQUAL `expectedEntries` (directory entries, a ZIP-format artefact, are not content); no
 * `hooks/`, `node_modules/`, `mcp.json` or `*.app.json` entry (a hooks or apps package cannot be
 * submitted); `expectedVersion` semantic and equal to the manifest's own `"version"`; every
 * `./`-relative path the manifest names resolves to an entry; each icon square, at least 48 px and
 * at most 5 MiB. Empty means the package is sound. Throws `Error` when the ZIP has no `plugin.json`
 * at all, is not JSON, or cannot be read. The manifest's paths are read from its `extensions.com.openai.interface` block (the logo and composer icon), its `version` from the top level.
 */
export function packageViolations(
  zip: Buffer,
  expectedEntries: readonly string[],
  expectedVersion: string,
): string[] {
  const files = new Map(
    readZip(zip)
      .filter((e) => !e.name.endsWith("/"))
      .map((e) => [e.name, e.data]),
  );
  const names = [...files.keys()].sort();
  const manifestBytes = files.get(OPENAI_PLUGIN_JSON_ENTRY);
  if (manifestBytes === undefined) throw new Error("plugin.json missing from the zip");
  const manifest = JSON.parse(manifestBytes.toString("utf-8")) as Record<string, unknown>;
  return [
    ...entrySetProblems(expectedEntries, names),
    ...names.filter(isForbidden).map((name) => `forbidden entry present: ${name}`),
    ...versionProblems(manifest, expectedVersion),
    ...manifestPathProblems(manifest, files),
  ];
}

function sourceFile(root: string, entry: string): string {
  if (entry.startsWith("skills/")) return join(root, PAGE_ROOT, entry.slice("skills/".length));
  return join(root, OPENAI_PLUGIN_ROOT, entry);
}

function readSource(root: string, entry: string): Buffer {
  const path = sourceFile(root, entry);
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`cannot stage ${entry}: ${path} is missing`);
  }
}

/** What {@link packPlugin} is given: the repository, where the ZIP goes, and what it packs. */
export interface PackRequest {
  readonly root: string;
  readonly outDir: string;
  readonly version: string;
  readonly skills: readonly Skill[];
  readonly listing: OpenAiListingFields;
}

/**
 * Builds `<outDir>/<listing name>-openai-plugin-<version>.zip` for the listing and skills given,
 * and asserts it: the version is refused first when not `X.Y.Z`; the entry list is derived from
 * `skills` and `listing`, every entry is staged from its source under `root` (`plugin.json` is
 * rendered WITH `version`; a page is read from `.agents/skills/`; an asset from the catalogue's
 * `openai-plugin/assets/`) — a missing source throws naming it; and the written ZIP is read back
 * and held to {@link packageViolations}. A package with a violation is deleted and reported by
 * throwing `Error`. Returns the ZIP's path and its sorted entry list.
 */
export function packPlugin(request: PackRequest): { path: string; entries: readonly string[] } {
  const { root, outDir, version, skills, listing } = request;
  assertSemanticVersion(version);
  const entries = openAiPackageEntries(skills, listing);
  const staged: ZipEntry[] = entries.map((name) => ({
    name,
    data:
      name === OPENAI_PLUGIN_JSON_ENTRY
        ? Buffer.from(renderOpenAiPluginJson(listing, version))
        : readSource(root, name),
  }));
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${listing.base.name}-openai-plugin-${version}.zip`);
  writeFileSync(path, writeZip(staged));
  const problems = packageViolations(readFileSync(path), entries, version);
  if (problems.length > 0) {
    rmSync(path);
    throw new Error(`${path} failed the OpenAI plugin package checks:\n${problems.join("\n")}`);
  }
  return { path, entries };
}

/**
 * The version the package carries: the published skills carrier's `package.json` `version`, this
 * runtime's own build — never typed into the listing. Throws `Error` when the file has no string
 * `version`.
 */
export function packageVersion(root: string): string {
  const manifest = JSON.parse(readFileSync(join(root, "packages/skills/package.json"), "utf-8"));
  if (typeof manifest?.version !== "string") {
    throw new Error("packages/skills/package.json carries no string version");
  }
  return manifest.version;
}
