// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// `.claude-plugin/marketplace.json` (the marketplace render target) lists ONE plugin whose
// `source` is `./.claude`, so whatever survives `.publishignore`'s strip-then-restore under
// `.claude/` in the staged snapshot IS the published plugin's content. `.publishignore` strips
// `.claude` whole and restores only `.claude/skills/**`, which is exactly right — this guard is
// what keeps that true: a `commands/`, `agents/` or `hooks/` directory added later, or a private
// file that slipped past the strip, would ship as part of the plugin. The other direction matters
// just as much: a plugin root removed whole (the `!.claude/skills/**` exception deleted) would
// publish a marketplace entry pointing at a directory that does not exist, which fails on a USER's
// machine at install time, not here.

export interface PluginRootGuardResult {
  readonly ok: boolean;
  /** Repo-relative paths under `.claude/` that are not `skills/` — empty when `ok`. */
  readonly strays: readonly string[];
  /** Set only when the plugin root itself is missing from the snapshot. */
  readonly error?: string;
}

/** Checks the staged `.claude/` directory under `stageRoot` holds nothing but `skills/`. */
export function checkPluginRoot(stageRoot: string): PluginRootGuardResult {
  const pluginRoot = join(stageRoot, ".claude");
  if (!existsSync(pluginRoot) || !statSync(pluginRoot).isDirectory()) {
    return {
      ok: false,
      strays: [],
      error:
        "the marketplace's plugin root (.claude/) is missing from the snapshot — " +
        ".claude-plugin/marketplace.json lists it as its plugin's source.",
    };
  }
  const strays = readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.name !== "skills")
    .map((entry) => `.claude/${entry.name}`);
  return { ok: strays.length === 0, strays };
}
