// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { basename, dirname, join } from "node:path";

/**
 * INTENT: the tree a registry reads — this repository's registry surface as a clone of the public
 * repository would show it, staged out of `HEAD` into a scratch directory.
 *
 * Out of `HEAD` and never out of the working tree, for the same reason the publish script's own
 * staging does it that way: a registry serves what was committed, so a trial run against
 * uncommitted edits would grade a tree no reader can get.
 *
 * @llmNote Two argv lists, never a shell string: `git archive` writes the tar, `tar` unpacks it,
 * and neither argument is ever reinterpreted. The caller creates the target directory and runs both
 * through the harness's own spawn seam.
 */

/**
 * What a registry actually reads: the plugin marketplace file and both rendered page flavours.
 * Every documented registry tool scans some subset of these three and nothing else of the
 * repository, so staging exactly them keeps a trial's tree honest in both directions — nothing a
 * reader cannot see, and nothing a reader can see left out.
 */
export const REGISTRY_SURFACE: readonly string[] = Object.freeze([
  ".claude-plugin",
  ".claude/skills",
  ".agents/skills",
]);

/**
 * The tarball's own path: a sibling of the staged tree, so the tree holds exactly what `git archive`
 * put there. A registry tool scans every file under the root it is given, and the intermediate
 * artefact of staging is not something a clone of the public repository shows.
 */
function archiveBeside(into: string): string {
  return join(dirname(into), `${basename(into)}.tar`);
}

/**
 * The commands that fill `into` with {@link REGISTRY_SURFACE} as of `HEAD` of the repository at
 * `repoRoot`. Both run with any working directory — every path is absolute, and `git` is pointed at
 * the repository with `-C` rather than inheriting it.
 */
export function stagingCommands(repoRoot: string, into: string): readonly (readonly string[])[] {
  const archive = archiveBeside(into);
  return [
    [
      "git",
      "-C",
      repoRoot,
      "archive",
      "--format=tar",
      "-o",
      archive,
      "HEAD",
      "--",
      ...REGISTRY_SURFACE,
    ],
    ["tar", "-xf", archive, "-C", into],
  ];
}
