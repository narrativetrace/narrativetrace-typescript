// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClaudeListing } from "../claude-listing.js";

/**
 * Renders `.claude/.claude-plugin/plugin.json`: the manifest of the plugin the root marketplace
 * file lists, kept INSIDE the plugin folder where Claude Code and Anthropic's plugin directory read
 * it. Without a manifest the plugin is named after its folder, `.claude`, a reserved name the
 * directory refuses.
 *
 * Keys are the ones the manifest reference documents (`name`, `description`, `author`, `homepage`,
 * `repository`, `license`, `keywords`) plus the directory listing fields the vendor reads from the
 * manifest only (`displayName`, `supportUrl`, `privacyPolicyUrl`, `documentationUrl`, `icon`). Every
 * shared value comes from the same `MarketplaceListing` that `renderMarketplaceJson` renders, so the manifest and the marketplace entry cannot disagree about
 * the plugin (the entry's `strict` defaults to true, so both are read and the manifest's metadata
 * is the plugin's own).
 *
 * No `version` key, deliberately: a relative-path plugin's version is the commit, and a version
 * literal here would make every release rewrite a folder whose skills did not change. Committed
 * BUILD OUTPUT, pinned by `tools/skills-render.ts --check`. Built line by line, like
 * `renderMarketplaceJson`, so a flat `keywords` list renders on ONE line, the shape Biome's JSON
 * formatter requires.
 */

/** Where the manifest finds its icon, relative to the plugin root (the `.claude/` folder). */
export const CLAUDE_PLUGIN_ICON_PATH = "./.claude-plugin/icon.png";

function quoteText(text: string): string {
  return JSON.stringify(text);
}

/** The directory-only keys, between `keywords` and `icon`. */
function directoryLines(directory: ClaudeListing): string[] {
  return [
    `  "displayName": ${quoteText(directory.displayName)},`,
    `  "supportUrl": ${quoteText(directory.supportUrl)},`,
    `  "privacyPolicyUrl": ${quoteText(directory.privacyPolicyUrl)},`,
    `  "documentationUrl": ${quoteText(directory.documentationUrl)},`,
  ];
}

export function renderClaudePluginJson(directory: ClaudeListing): string {
  const listing = directory.base;
  const keywords = listing.keywords.map(quoteText).join(", ");
  const lines = [
    "{",
    `  "name": ${quoteText(listing.name)},`,
    `  "description": ${quoteText(listing.pluginDescription)},`,
    '  "author": {',
    `    "name": ${quoteText(listing.owner.name)}`,
    "  },",
    `  "homepage": ${quoteText(listing.homepage)},`,
    `  "repository": ${quoteText(listing.repository)},`,
    `  "license": ${quoteText(listing.license)},`,
    `  "keywords": [${keywords}],`,
    ...directoryLines(directory),
    `  "icon": ${quoteText(CLAUDE_PLUGIN_ICON_PATH)}`,
    "}",
  ];
  return `${lines.join("\n")}\n`;
}
