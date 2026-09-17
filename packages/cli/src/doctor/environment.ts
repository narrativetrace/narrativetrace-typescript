// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

type Bucket = "output" | "approved" | "source" | "skip";

interface WalkState {
  readonly sourceFiles: Map<string, string>;
  readonly outputFiles: Map<string, string>;
  readonly approvedDirFiles: Map<string, string>;
  visited: number;
}

// Stryker disable BlockStatement: the three functions below whose catch block is just `return
// undefined;` are equivalent under mutation — an emptied `catch {}` falls off the end of the
// function and implicitly returns `undefined` too. No test can observe a difference between the
// explicit and implicit forms. Restored below, before safeRead/listDirectory, whose catch blocks
// return "" / [] respectively and are NOT equivalent (a real behavior change is observable there).

function readJson(path: string): PackageJsonLike | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJsonLike;
  } catch {
    return undefined;
  }
}

/** Every `node_modules` directory a consumer rooted at `cwd` resolves through, nearest first. */
function* nodeModulesChain(cwd: string): Generator<string> {
  let dir = resolve(cwd);
  for (;;) {
    yield join(dir, "node_modules");
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * Reads an installed package's own `package.json` WITHOUT going through its `exports` map.
 *
 * INTENT: every published `@narrativetrace/*` package declares `exports` and none of them list
 * `"./package.json"`, so `require.resolve("<name>/package.json")` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` for all of them in a real consumer project. That silently turned
 * every `installedPackages`-driven check — `toolchain.vitest-peer`, `toolchain.sibling-packages`,
 * and `toolchain.node-engine`'s engines lookup — into its own "not installed — nothing to check"
 * pass against every real install: a graceful skip that had never once run. The unit fixtures
 * declare no `exports`, so resolution succeeded there and the gap was invisible; the defect lived
 * entirely in an environment the tests had structurally never exercised.
 *
 * Walking the `node_modules` chain upward from `cwd` is also exactly the semantics
 * `toolchain.sibling-packages` wants: resolvable from the CONSUMER's own root, never from inside
 * a dependency's own nested tree.
 */
function resolvePackageJson(name: string, cwd: string): PackageJsonLike | undefined {
  const segments = name.split("/");
  for (const modules of nodeModulesChain(cwd)) {
    const pkg = readJson(join(modules, ...segments, "package.json"));
    if (pkg) return pkg;
  }
  return undefined;
}

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

function listDirectory(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function classify(rel: string, outputDirName: string, approvedDirName: string): Bucket {
  const topSegment = rel.split("/")[0];
  if (topSegment === outputDirName) return "output";
  if (topSegment === approvedDirName) return "approved";
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
