// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One publishable package, as the workspace's own manifests declare it — never hand-kept. */
export interface WorkspacePackage {
  readonly name: string;
  readonly version: string;
  /** Path relative to the repo root, e.g. `packages/core-node`. */
  readonly dir: string;
}

interface Manifest {
  readonly name?: string;
  readonly version?: string;
  readonly private?: boolean;
}

/**
 * The `packages:` glob entries from `pnpm-workspace.yaml`, in file order.
 *
 * @remarks A line-based reader, not a YAML parser: this repository's workspace file only ever
 * uses the trailing-`/*` glob shape pnpm's own `packages` field supports, and pulling in a YAML
 * dependency to read two lines would be the tail wagging the dog. If the file ever grows a shape
 * this cannot read, the caller throws — loud, not a silently empty package list.
 */
export function workspaceGlobs(workspaceYaml: string): string[] {
  const lines = workspaceYaml.split("\n");
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) throw new Error("pnpm-workspace.yaml has no top-level 'packages:' key");
  const globs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s*-\s*["']?([^"'\s]+)["']?\s*$/);
    if (!match?.[1]) break;
    globs.push(match[1]);
  }
  return globs;
}

/** Directories one workspace glob names, relative to `repoRoot`. Only the trailing-`/*` shape
 * (every immediate subdirectory) and a bare literal path are supported — the two shapes
 * `pnpm-workspace.yaml` actually uses. */
function expandGlob(repoRoot: string, glob: string): string[] {
  if (!glob.endsWith("/*")) return existsSync(join(repoRoot, glob)) ? [glob] : [];
  const base = glob.slice(0, -2);
  const baseAbs = join(repoRoot, base);
  if (!existsSync(baseAbs)) return [];
  return readdirSync(baseAbs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${base}/${entry.name}`);
}

function readManifest(repoRoot: string, dir: string): Manifest | undefined {
  const manifestPath = join(repoRoot, dir, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
}

/**
 * Every non-private package the workspace itself declares, derived straight from
 * `pnpm-workspace.yaml`'s own globs — not a hand-kept list. A package added under any workspace
 * root is picked up the moment its manifest drops `private`, with no second place to remember to
 * update; this is also the check that would catch a package silently missing from a release (it
 * is polled below precisely because it was found here).
 */
export function derivePublishablePackages(repoRoot: string): WorkspacePackage[] {
  const workspaceYaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf-8");
  const dirs = workspaceGlobs(workspaceYaml).flatMap((glob) => expandGlob(repoRoot, glob));
  const packages: WorkspacePackage[] = [];
  for (const dir of dirs) {
    const manifest = readManifest(repoRoot, dir);
    if (!manifest || manifest.private === true) continue;
    if (!manifest.name || !manifest.version) {
      throw new Error(`${dir}/package.json is not private but is missing name or version`);
    }
    packages.push({ name: manifest.name, version: manifest.version, dir });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}
