// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// The publish pipeline's strip loop (`.publishignore`, one `rm -rf` per pattern) has no
// notion of "strip this broad path, but ship one thing under it" — `.claude/` is stripped whole
// (it also holds the private `settings.local.json`) even though `.claude/skills/**/SKILL.md` is
// committed BUILD OUTPUT the public repo must ship at the exact path Claude Code discovers it
// (documentation/what-to-commit.md). A `!`-prefixed `.publishignore` line means the opposite of
// every other line: "restore this path from the pristine pre-strip snapshot, after every strip
// pattern has run" — order-independent by construction, since restoration always happens once,
// last, regardless of where in the file the broader strip pattern that removed it lives.

/**
 * Every `!`-prefixed exception line in `.publishignore`'s text, in file order — comments and
 * blank lines skipped, a trailing `/**` sugar-stripped (restoring a directory already implies
 * everything under it, the same way `rm -rf` on the strip side needs no `/**` to remove one).
 */
export function parseRestoreExceptions(ignoreText: string): string[] {
  const exceptions: string[] = [];
  for (const rawLine of ignoreText.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("!")) continue;
    const path = line
      .slice(1)
      .trim()
      .replace(/\/\*\*$/, "");
    if (path.length > 0) exceptions.push(path);
  }
  return exceptions;
}

/**
 * Restores each of `relPaths` into `stageRoot`, copied recursively from `pristineRoot` (the
 * snapshot taken before `.publishignore`'s strip patterns ran). Any stub left at the destination
 * is removed first, so a restore is idempotent whether or not a strip pattern actually reached
 * that path.
 *
 * @returns `restored` — paths successfully copied back, in `relPaths` order.
 * @returns `missing` — paths absent from `pristineRoot`: a stale or mistyped exception, reported
 * back rather than silently skipped so the caller can fail the publish run loudly, the same way
 * every other gate in this pipeline does.
 */
export function restoreExceptions(
  stageRoot: string,
  pristineRoot: string,
  relPaths: readonly string[],
): { restored: string[]; missing: string[] } {
  const restored: string[] = [];
  const missing: string[] = [];
  for (const relPath of relPaths) {
    const source = join(pristineRoot, relPath);
    if (!existsSync(source)) {
      missing.push(relPath);
      continue;
    }
    const target = join(stageRoot, relPath);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
    restored.push(relPath);
  }
  return { restored, missing };
}
