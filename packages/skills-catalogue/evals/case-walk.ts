// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Directories no case lives in: what a package manager, a trial run, a coverage run or turbo leaves
 * inside a fixture. Walking them is wrong twice over — their `prompt.md` files are not cases, and
 * `node_modules` links back into workspace packages whose `.turbo/` is written and removed while
 * the gate runs in parallel (the B-96 `ENOENT` race).
 */
const ARTEFACT_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  "narrativetrace-output",
  "coverage",
  ".turbo",
]);

/**
 * Every `prompt.md` under `root`, `root`-relative with `/` separators, in a stable order.
 *
 * @llmNote Skips the directories in `ARTEFACT_DIRECTORIES` at any depth and never follows a
 * symbolic link (a link is neither a file nor a directory to `Dirent`, so a dangling or
 * out-of-tree one cannot throw or leak a foreign file in).
 *
 * @param root - absolute path of an `evals/` tree (or any tree laid out like one)
 */
export function everyCasePromptUnder(root: string): readonly string[] {
  return everyFileUnder(root, (name) => name === "prompt.md");
}

/**
 * Every regular file under `root` whose base name `keep` accepts, `root`-relative with `/`
 * separators, in a stable order.
 *
 * @llmNote The one walk of an `evals/` tree: same `ARTEFACT_DIRECTORIES` skip list at any depth and
 * the same refusal to follow links as `everyCasePromptUnder`, which is this with a name filter.
 *
 * @param root - absolute path of an `evals/` tree (or any tree laid out like one)
 * @param keep - receives a file's base name; true keeps it
 */
export function everyFileUnder(root: string, keep: (name: string) => boolean): readonly string[] {
  return walk(root, root, keep).sort();
}

function walk(root: string, directory: string, keep: (name: string) => boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ARTEFACT_DIRECTORIES.has(entry.name) ? [] : walk(root, path, keep);
    }
    return entry.isFile() && keep(entry.name) ? [relative(root, path).split("\\").join("/")] : [];
  });
}
