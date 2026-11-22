// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// `.claude-plugin/marketplace.json` (the marketplace render target) lists ONE plugin whose
// `source` is `./.claude`, so whatever survives `.publishignore`'s strip-then-restore under
// `.claude/` in the staged snapshot IS the published plugin's content. `.publishignore` strips
// `.claude` whole and restores only `.claude/skills/**`, the plugin's own manifest and icon
// (`.claude/.claude-plugin/**`) and its README (`.claude/README.md`), which is exactly right — this
// guard is what keeps that true: a `commands/`, `agents/` or `hooks/` directory added later, or a
// private file that slipped past the strip, would ship as part of the plugin. The other direction
// matters just as much: a plugin root removed whole (the `!.claude/skills/**` exception deleted)
// would publish a marketplace entry pointing at a directory that does not exist, which fails on a
// USER's machine at install time, not here; and a plugin root without its manifest, icon or README
// is one Anthropic's plugin directory names after the folder (`.claude`, a reserved name), shows
// without an icon, or refuses outright.

/** What the plugin root holds besides `skills/`, relative to `.claude/`. */
const PLUGIN_DIR = ".claude-plugin";
const README = "README.md";
const MANIFEST_FILES = ["plugin.json", "icon.png"] as const;

/** Files the directory needs, relative to `.claude/`, in the order they are reported missing. */
const REQUIRED = [`${PLUGIN_DIR}/plugin.json`, `${PLUGIN_DIR}/icon.png`, README] as const;

export interface PluginRootGuardResult {
  readonly ok: boolean;
  /** Repo-relative paths under `.claude/` that the plugin must not carry — empty when `ok`. */
  readonly strays: readonly string[];
  /** Repo-relative paths of the manifest, icon and README the plugin root lacks — empty when `ok`. */
  readonly missing: readonly string[];
  /** Every file staged under `.claude/`, sorted — what the published plugin consists of. */
  readonly files: readonly string[];
  /** Set only when the plugin root itself is missing from the snapshot. */
  readonly error?: string;
}

function listFiles(directory: string, prefix: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(directory, entry.name), `${prefix}/${entry.name}`)
      : [`${prefix}/${entry.name}`],
  );
}

/**
 * Checks the staged `.claude/` directory under `stageRoot` holds exactly `skills/`, `README.md`
 * and `.claude-plugin/` with `plugin.json` and `icon.png` in it, and that the three files the
 * directory needs are all there.
 */
export function checkPluginRoot(stageRoot: string): PluginRootGuardResult {
  const pluginRoot = join(stageRoot, ".claude");
  if (!existsSync(pluginRoot) || !statSync(pluginRoot).isDirectory()) {
    return {
      ok: false,
      strays: [],
      missing: [],
      files: [],
      error:
        "the marketplace's plugin root (.claude/) is missing from the snapshot — " +
        ".claude-plugin/marketplace.json lists it as its plugin's source.",
    };
  }
  const rootStrays = readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => !["skills", PLUGIN_DIR, README].includes(entry.name))
    .map((entry) => `.claude/${entry.name}`);
  const pluginDir = join(pluginRoot, PLUGIN_DIR);
  const manifestStrays = existsSync(pluginDir)
    ? readdirSync(pluginDir)
        .filter((name) => !(MANIFEST_FILES as readonly string[]).includes(name))
        .map((name) => `.claude/${PLUGIN_DIR}/${name}`)
    : [];
  const missing = REQUIRED.filter((required) => !existsSync(join(pluginRoot, required))).map(
    (required) => `.claude/${required}`,
  );
  const strays = [...rootStrays, ...manifestStrays];
  return {
    ok: strays.length === 0 && missing.length === 0,
    strays,
    missing,
    files: listFiles(pluginRoot, ".claude").sort(),
  };
}
