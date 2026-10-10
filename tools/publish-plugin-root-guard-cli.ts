// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { checkPluginRoot } from "./publish-plugin-root-guard.js";

// CLI entry the publish pipeline shells out to right after restoring `.publishignore`'s
// exceptions, before composing the public AGENTS.md: proves the staged `.claude/` holds nothing
// but `skills/` — the plugin root `.claude-plugin/marketplace.json` lists as its one plugin's
// content.

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
if (!result.ok) {
  console.error(
    "ERROR: the staged plugin root holds more than skills/ — every path below ships as " +
      "plugin content of .claude-plugin/marketplace.json:",
  );
  for (const stray of result.strays) console.error(stray);
  process.exit(1);
}
console.log("the plugin root holds only skills/.");
