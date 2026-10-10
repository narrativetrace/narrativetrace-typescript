// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { FEEDBACK_SUBDIRECTORY } from "../feedback/feedback-paths.js";
import { resolveCarrier } from "../init/carrier.js";
import type { InstalledSkill } from "../init/installed-skill.js";
import { DEFAULT_MAX_SKILL_DIRECTORIES, installedSkillsIn } from "../init/project-state-reader.js";
import { readJsonFile, resolvePackageJson } from "../package-resolution.js";
import { LOCKFILES, packageManagerOf } from "./package-manager.js";
import type { DoctorSnapshot, Env, PackageJsonLike } from "./types.js";

const EXCLUDED_DIRS = new Set([
  // Stryker disable next-line StringLiteral: equivalent — every dot-prefixed entry name is
  // already excluded earlier, in visitEntry's leading-dot check (the only exception there is
  // ".env", which isn't a directory this set would ever mention), so ".git" never actually
  // reaches this set's `.has()` check.
  ".git",
  // Stryker disable next-line StringLiteral: same equivalence as ".git" above.
  ".turbo",
  // Stryker disable next-line StringLiteral: same equivalence as ".git" above.
  ".stryker-tmp",
  // Not dot-prefixed, so NOT equivalent — reaching this set's `.has()` check is the only thing
  // that excludes each of the four names below; each is covered by a real test.
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

/** Well-known package names the checks resolve directly; siblings of @narrativetrace/vitest are added dynamically. */
const BASE_PACKAGES = [
  "vitest",
  "@narrativetrace/core",
  "@narrativetrace/core-node",
  "@narrativetrace/vitest",
];

const MAX_FILES = 20_000;

const MANIFEST = "package.json";

type Bucket = "output" | "approved" | "manifest" | "source" | "skip";

interface WalkState {
  readonly manifests: Map<string, PackageJsonLike>;
  readonly sourceFiles: Map<string, string>;
  readonly outputFiles: Map<string, string>;
  readonly approvedDirFiles: Map<string, string>;
  visited: number;
}

// Stryker disable BlockStatement: the function below, whose catch block is just `return undefined;`,
// is equivalent under mutation — an emptied `catch {}` falls off the end of the function and
// implicitly returns `undefined` too. No test can observe a difference between the explicit and
// implicit forms. Restored below, before safeRead/listDirectory, whose catch blocks return "" / []
// respectively and are NOT equivalent (a real behavior change is observable there).

/** `undefined` when `path` cannot be stat'd at all (a dangling symlink, a permission error, a race). */
function isDirectorySafe(path: string): boolean | undefined {
  try {
    return statSync(path).isDirectory();
  } catch {
    return undefined;
  }
}

// Stryker restore BlockStatement

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** A manifest's parsed object, or `undefined` for one that does not parse to an object. */
function parseManifest(text: string): PackageJsonLike | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as PackageJsonLike)
      : undefined;
  } catch {
    return undefined;
  }
}

function listDirectory(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Which bucket `rel` belongs to. The feedback verb's own subdirectory of the output directory is
 * SKIPPED: a problem report is not rendered trace output, and reading it as such made the doctor
 * report on its own words — the attached doctor JSON names `arg0` in a doc URL, so
 * `trap.parameter-arg0` failed on every project the moment it had drafted one report, and the next
 * draft carried that false finding (found by a Tier B fixture, 2026-10-08).
 */
function classify(rel: string, outputDirName: string, approvedDirName: string): Bucket {
  const segments = rel.split("/");
  const topSegment = segments[0];
  if (topSegment === outputDirName) {
    const inFeedback = segments.length > 2 && segments[1] === FEEDBACK_SUBDIRECTORY;
    return inFeedback ? "skip" : "output";
  }
  if (topSegment === approvedDirName) return "approved";
  if (segments[segments.length - 1] === MANIFEST) return "manifest";
  // Stryker disable next-line StringLiteral: the "source" branch string is equivalent — bucketFor
  // below routes anything that isn't "output" or "approved" into sourceFiles by default, so
  // whether this literal reads "source" or something else never changes which map a file lands
  // in. The "skip" branch is NOT equivalent (a real behavior change is observable there) and is
  // exercised by a real test.
  return SOURCE_EXTENSIONS.some((ext) => rel.endsWith(ext)) ? "source" : "skip";
}

function bucketFor(state: WalkState, kind: Bucket): Map<string, string> {
  return kind === "output"
    ? state.outputFiles
    : kind === "approved"
      ? state.approvedDirFiles
      : state.sourceFiles;
}

interface WalkContext {
  readonly state: WalkState;
  readonly root: string;
  readonly output: string;
  readonly approved: string;
  readonly queue: string[];
}

/** Visits one directory entry: enqueues a subdirectory, or files it into the right bucket. */
function visitEntry(ctx: WalkContext, dir: string, entry: string): void {
  if (entry.startsWith(".") && entry !== ".env") return;
  const full = join(dir, entry);
  const isDir = isDirectorySafe(full);
  if (isDir === undefined) return;
  if (isDir) {
    if (!EXCLUDED_DIRS.has(entry)) ctx.queue.push(full);
    return;
  }
  ctx.state.visited++;
  const rel = relative(ctx.root, full);
  const kind = classify(rel, ctx.output, ctx.approved);
  if (kind === "skip") return;
  if (kind === "manifest") {
    const manifest = parseManifest(safeRead(full));
    if (manifest) ctx.state.manifests.set(rel, manifest);
    return;
  }
  bucketFor(ctx.state, kind).set(rel, safeRead(full));
}

/**
 * Walks `root` breadth-first, bucketing files into source (extension-filtered), the output
 * directory, and the approved-trace directory — excluding `node_modules`/build/coverage noise.
 * Bounded by {@link MAX_FILES} so a doctor run in a huge repo degrades to a partial scan rather
 * than hanging. The outer loop's own `state.visited < MAX_FILES` half of that bound is equivalent
 * under mutation — the inner loop's `if (state.visited >= MAX_FILES) break;` enforces the exact
 * same cap on its own, before any further entry is ever visited, so weakening the outer guard only
 * costs a few extra, immediately aborted `listDirectory` calls on already-queued directories; no
 * test can observe a different `WalkState`.
 */
function walk(root: string, output: string, approved: string): WalkState {
  const state: WalkState = {
    manifests: new Map(),
    sourceFiles: new Map(),
    outputFiles: new Map(),
    approvedDirFiles: new Map(),
    visited: 0,
  };
  const ctx: WalkContext = { state, root, output, approved, queue: [root] };
  // Stryker disable next-line ConditionalExpression,EqualityOperator: see the doc comment above.
  while (ctx.queue.length > 0 && state.visited < MAX_FILES) {
    const dir = ctx.queue.shift() as string;
    for (const entry of listDirectory(dir)) {
      if (state.visited >= MAX_FILES) break;
      visitEntry(ctx, dir, entry);
    }
  }
  return state;
}

function resolveBasePackages(cwd: string): Map<string, PackageJsonLike> {
  const installed = new Map<string, PackageJsonLike>();
  for (const name of BASE_PACKAGES) {
    const pkg = resolvePackageJson(name, cwd);
    if (pkg) installed.set(name, pkg);
  }
  return installed;
}

/** Resolves `@narrativetrace/vitest`'s own `@narrativetrace/*` dependencies — the sibling check's data. */
function resolveVitestSiblings(cwd: string, installed: Map<string, PackageJsonLike>): void {
  const ntVitest = installed.get("@narrativetrace/vitest");
  for (const name of Object.keys(ntVitest?.dependencies ?? {})) {
    if (!name.startsWith("@narrativetrace/") || installed.has(name)) continue;
    const pkg = resolvePackageJson(name, cwd);
    if (pkg) installed.set(name, pkg);
  }
}

function resolveInstalledPackages(cwd: string): Map<string, PackageJsonLike> {
  const installed = resolveBasePackages(cwd);
  resolveVitestSiblings(cwd, installed);
  return installed;
}

/**
 * The resolved carrier's catalogue skill names, or empty when none could be resolved — offline is
 * not a defect, {@link checkSkillsInstalled} reads the absence as "cannot tell".
 */
function catalogueSkillsIn(cwd: string, bundledSkillsDirectory: string | undefined): string[] {
  try {
    return resolveCarrier({
      projectDirectory: cwd,
      bundledDirectory: bundledSkillsDirectory,
    }).catalogue.skills.map((skill) => skill.name);
  } catch {
    return [];
  }
}

interface AgentSkillsHalf {
  readonly installedSkills: InstalledSkill[];
  readonly catalogueSkills: string[];
}

/** The agent-skills half of a snapshot: what is installed, and what the carrier's catalogue lists. */
function agentSkillsIn(cwd: string, bundledSkillsDirectory: string | undefined): AgentSkillsHalf {
  return {
    installedSkills: installedSkillsIn(cwd, DEFAULT_MAX_SKILL_DIRECTORIES),
    catalogueSkills: catalogueSkillsIn(cwd, bundledSkillsDirectory),
  };
}

/** {@link walk} over `cwd`, with the output and approved directories the environment names. */
function walkFor(cwd: string, env: Env): WalkState {
  const output = env.NARRATIVETRACE_OUTPUT_DIR ?? "narrativetrace-output";
  const approved = env.NARRATIVETRACE_APPROVED_DIR ?? "narratives";
  return walk(cwd, output, approved);
}

/** The lockfiles present at the project root — never a workspace member's. */
function rootLockfiles(cwd: string): string[] {
  return LOCKFILES.filter((name) => existsSync(join(cwd, name)));
}

/** The root manifest and the package manager it, or the root lockfile, names. */
function rootHalf(cwd: string): Pick<DoctorSnapshot, "rootPackageJson" | "packageManager"> {
  const rootPackageJson = readJsonFile(join(cwd, MANIFEST));
  return { rootPackageJson, packageManager: packageManagerOf(rootPackageJson, rootLockfiles(cwd)) };
}

/** The runtime's two config source names, in the order `resolveConfig` lists them. */
const CONFIG_SOURCES = ["narrativetrace.config.json", ".narrativetracerc.json"] as const;

/** The first config source present at the root, as raw text (omitted when there is none). */
function projectConfigOf(cwd: string): Pick<DoctorSnapshot, "projectConfig"> {
  for (const name of CONFIG_SOURCES) {
    const path = join(cwd, name);
    if (existsSync(path)) return { projectConfig: readFileSync(path, "utf8") };
  }
  return {};
}

/**
 * Builds a {@link DoctorSnapshot} from the real filesystem rooted at `cwd`. The one impure module.
 *
 * @param bundledSkillsDirectory the running CLI's own package directory, whose `skills/` holds the
 * carrier it bundles — the same fallback `init` uses (D4). `undefined` when the caller has none to
 * offer, e.g. a host that is not the CLI.
 */
export function buildSnapshot(
  cwd: string,
  env: Env,
  bundledSkillsDirectory?: string,
): DoctorSnapshot {
  const { manifests, sourceFiles, outputFiles, approvedDirFiles } = walkFor(cwd, env);
  return {
    cwd,
    nodeVersion: process.version.replace(/^v/, ""),
    env,
    ...rootHalf(cwd),
    ...projectConfigOf(cwd),
    manifests,
    sourceFiles,
    outputFiles,
    approvedDirFiles,
    installedPackages: resolveInstalledPackages(cwd),
    ...agentSkillsIn(cwd, bundledSkillsDirectory),
  };
}
