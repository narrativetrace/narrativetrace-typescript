// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT_MARKER = "pnpm-workspace.yaml";

/**
 * Walks up from `startDir` to the nearest ancestor that holds `pnpm-workspace.yaml`. Resolving from
 * the test file's own location by marker, never by a fixed `..` count: Stryker's sandbox copies the
 * PACKAGE into `<package>/.stryker-tmp/sandbox-*`, one directory deeper than the real checkout, so
 * a fixed three `..` lands on the package root there. The sandbox lives inside the real package
 * directory, so the walk still reaches the real repository root, where the real carrier and the
 * bundled CLI copy are.
 *
 * Mirrors `packages/skills-catalogue/__tests__/repo-root.ts`.
 */
export function findRepoRoot(startDir: string): string {
  for (let dir = startDir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ROOT_MARKER))) return dir;
    if (dirname(dir) === dir) throw new Error(`no ${ROOT_MARKER} above ${startDir}`);
  }
}

export const REPO_ROOT = findRepoRoot(import.meta.dirname);
/** Kept so existing `skipIf` guards stay valid; the walk above now throws instead of being false. */
export const REPO_ROOT_REACHABLE = true;
