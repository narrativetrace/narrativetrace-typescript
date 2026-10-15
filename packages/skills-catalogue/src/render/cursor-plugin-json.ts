// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { MarketplaceListing } from "../marketplace-listing.js";

/**
 * Renders the Cursor plugin manifest pair — `.cursor-plugin/plugin.json` and
 * `.cursor-plugin/marketplace.json` — from the SAME {@link MarketplaceListing} that renders
 * `.claude-plugin/marketplace.json`.
 *
 * INTENT: one catalogue, one listing, two vendors' files. The plugin is the repository root and
 * carries the skills as the open-standard `.agents/skills` directory Cursor reads natively plus the
 * one rule file that points at them — no commands, hooks, agents or MCP servers (Phase 8 D3).
 * Committed BUILD OUTPUT like every render target; `tools/skills-render.ts --check` pins both files
 * against a fresh render.
 *
 * @llmNote Field names follow Cursor's plugin reference (verified 2026-10-10): `name` is required,
 * `author` takes `name`/`email` only, a `skills` or `rules` path replaces folder discovery, and a
 * marketplace entry's `source` is the plugin directory relative to the repository root — `.` for a
 * repository that is itself the one plugin. No `version` key, for the reason
 * {@link MarketplaceListing} states. Built line by line like `renderMarketplaceJson`, so a flat
 * `keywords` list renders on ONE line, which is the shape Biome's JSON formatter requires.
 */

/** The skills directory the plugin points at: the open-standard flavour Cursor reads natively. */
export const CURSOR_SKILLS_PATH = "./.agents/skills/";

/** The one rule the plugin carries, the same file `init` writes into a Cursor project. */
export const CURSOR_RULE_PATH = "./.cursor/rules/narrativetrace.mdc";

function quoteText(text: string): string {
  return JSON.stringify(text);
}

function keywordsOf(listing: MarketplaceListing): string {
  return `[${listing.keywords.map(quoteText).join(", ")}]`;
}

/** `.cursor-plugin/plugin.json`. */
export function renderCursorPluginJson(listing: MarketplaceListing): string {
  const lines = [
    "{",
    `  "name": ${quoteText(listing.name)},`,
    `  "description": ${quoteText(listing.pluginDescription)},`,
    '  "author": {',
    `    "name": ${quoteText(listing.owner.name)}`,
    "  },",
    `  "license": ${quoteText(listing.license)},`,
    `  "homepage": ${quoteText(listing.homepage)},`,
    `  "keywords": ${keywordsOf(listing)},`,
    `  "skills": ${quoteText(CURSOR_SKILLS_PATH)},`,
    `  "rules": ${quoteText(CURSOR_RULE_PATH)}`,
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

/** The marketplace's one plugin entry: the repository itself, `.` as its source. */
function marketplacePluginLines(listing: MarketplaceListing): readonly string[] {
  return [
    "    {",
    `      "name": ${quoteText(listing.name)},`,
    '      "source": ".",',
    `      "description": ${quoteText(listing.pluginDescription)},`,
    `      "license": ${quoteText(listing.license)},`,
    `      "homepage": ${quoteText(listing.homepage)},`,
    `      "keywords": ${keywordsOf(listing)}`,
    "    }",
  ];
}

/** `.cursor-plugin/marketplace.json`. */
export function renderCursorMarketplaceJson(listing: MarketplaceListing): string {
  const lines = [
    "{",
    `  "name": ${quoteText(listing.name)},`,
    '  "owner": {',
    `    "name": ${quoteText(listing.owner.name)}`,
    "  },",
    '  "metadata": {',
    `    "description": ${quoteText(listing.description)}`,
    "  },",
    '  "plugins": [',
    ...marketplacePluginLines(listing),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}
