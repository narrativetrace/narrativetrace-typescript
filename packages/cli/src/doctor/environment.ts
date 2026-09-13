// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import type { DoctorSnapshot, Env, PackageJsonLike } from "./types.js";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".stryker-tmp",
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

type Bucket = "output" | "approved" | "source" | "skip";

interface WalkState {
  readonly sourceFiles: Map<string, string>;
  readonly outputFiles: Map<string, string>;
  readonly approvedDirFiles: Map<string, string>;
  visited: number;
}

function readJson(path: string): PackageJsonLike | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJsonLike;
  } catch {
    return undefined;
  }
}

function resolvePackageJson(name: string, cwd: string): PackageJsonLike | undefined {
  try {
    const require = createRequire(join(cwd, "package.json"));
    return readJson(require.resolve(`${name}/package.json`));
  } catch {
    return undefined;
  }
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function listDirectory(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** `undefined` when `path` cannot be stat'd at all (a dangling symlink, a permission error, a race). */
function isDirectorySafe(path: string): boolean | undefined {
  try {
    return statSync(path).isDirectory();
  } catch {
    return undefined;
  }
}

function classify(rel: string, outputDirName: string, approvedDirName: string): Bucket {
  const topSegment = rel.split("/")[0];
  if (topSegment === outputDirName) return "output";
  if (topSegment === approvedDirName) return "approved";
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
  bucketFor(ctx.state, kind).set(rel, safeRead(full));
}

/**
 * Walks `root` breadth-first, bucketing files into source (extension-filtered), the output
 * directory, and the approved-trace directory — excluding `node_modules`/build/coverage noise.
 * Bounded by {@link MAX_FILES} so a doctor run in a huge repo degrades to a partial scan rather
 * than hanging.
 */
function walk(root: string, output: string, approved: string): WalkState {
  const state: WalkState = {
    sourceFiles: new Map(),
    outputFiles: new Map(),
    approvedDirFiles: new Map(),
    visited: 0,
  };
  const ctx: WalkContext = { state, root, output, approved, queue: [root] };
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

/** Builds a {@link DoctorSnapshot} from the real filesystem rooted at `cwd`. The one impure module. */
export function buildSnapshot(cwd: string, env: Env): DoctorSnapshot {
  const output = env.NARRATIVETRACE_OUTPUT_DIR ?? "narrativetrace-output";
  const approved = env.NARRATIVETRACE_APPROVED_DIR ?? "narratives";
  const { sourceFiles, outputFiles, approvedDirFiles } = walk(cwd, output, approved);
  return {
    cwd,
    nodeVersion: process.version.replace(/^v/, ""),
    env,
    rootPackageJson: readJson(join(cwd, "package.json")),
    sourceFiles,
    outputFiles,
    approvedDirFiles,
    installedPackages: resolveInstalledPackages(cwd),
  };
}
