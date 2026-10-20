// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** The file whose presence marks the repository (workspace) root. */
const ROOT_MARKER = "pnpm-workspace.yaml";

/**
 * The nearest ancestor of `dir` (or `dir` itself) that holds `pnpm-workspace.yaml`.
 *
 * @llmNote Finds the root by its marker, never by counting `..` levels: the same test file runs
 * from `evals/__tests__` in the real tree and from `.stryker-tmp/sandbox-N/evals/__tests__` under
 * mutation testing, where a fixed depth lands in the package directory instead of the repository.
 *
 * @param dir - absolute path to start from
 * @throws Error naming the marker when no ancestor holds it
 */
export function repoRootOf(dir: string): string {
  for (let current = dir; ; current = dirname(current)) {
    if (existsSync(join(current, ROOT_MARKER))) return current;
    if (dirname(current) === current) {
      throw new Error(`no ${ROOT_MARKER} found at or above ${dir}`);
    }
  }
}
