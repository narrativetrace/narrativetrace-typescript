// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { checkPluginRoot } from "./publish-plugin-root-guard.js";

// CLI entry the publish pipeline shells out to right after restoring `.publishignore`'s
// exceptions, before composing the public AGENTS.md: proves the staged `.claude/` holds exactly
// `skills/`, the plugin's own manifest and icon (`.claude-plugin/`) and its README — the plugin
// root `.claude-plugin/marketplace.json` lists as its one plugin's content — and lists the files.

const [, , stageRoot] = process.argv;
if (!stageRoot) {
  console.error("usage: tsx publish-plugin-root-guard-cli.ts <stageRoot>");
  process.exit(1);
}

const result = checkPluginRoot(stageRoot);
if (result.error) {
  console.error(`ERROR: ${result.error}`);
  process.exit(1);
}
if (result.strays.length > 0) {
  console.error(
    "ERROR: the staged plugin root holds more than skills/, README.md and .claude-plugin/ — " +
      "every path below ships as plugin content of .claude-plugin/marketplace.json:",
  );
  for (const stray of result.strays) console.error(stray);
  process.exit(1);
}
if (result.missing.length > 0) {
  console.error(
    "ERROR: the staged plugin root lacks the manifest, the icon or the README the plugin " +
      "directory needs in the plugin folder itself:",
  );
  for (const absent of result.missing) console.error(absent);
  process.exit(1);
}
for (const file of result.files) console.log(`  ${file}`);
console.log(
  "the plugin root holds exactly skills/, README.md and .claude-plugin/ (plugin.json, icon.png).",
);
