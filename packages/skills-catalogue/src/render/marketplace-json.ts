// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { MarketplaceListing } from "../marketplace-listing.js";

/**
 * Renders `.claude-plugin/marketplace.json`: the file that makes this repository a plugin
 * marketplace carrying one plugin — the rendered Claude-flavour skill pages, rooted at the
 * `.claude/` directory they already sit in.
 *
 * Committed BUILD OUTPUT, like every other render target: the typed {@link MarketplaceListing} is
 * the only place this content is written, and the drift test pins the committed file against a
 * fresh render.
 *
 * Built line by line rather than through `JSON.stringify(_, null, 2)`: `.claude-plugin/` is not
 * excluded from this repo's `biome check` (only the literal `.claude` directory is — a short,
 * flat `keywords` list has to render on ONE line, matching the shape Biome's own JSON formatter
 * requires, or the per-commit gate would reject committed build output for not matching a
 * formatter nobody ran on it. `JSON.stringify` still does every scalar's escaping — no hand-rolled
 * encoder.
 */
function quoteText(text: string): string {
  return JSON.stringify(text);
}

/** The single plugin entry's lines — the `name` and `source` the vendor requires, plus the display fields. */
function pluginEntryLines(listing: MarketplaceListing): readonly string[] {
  const keywords = listing.keywords.map(quoteText).join(", ");
  return [
    "    {",
    `      "name": ${quoteText(listing.name)},`,
    `      "source": ${quoteText(listing.pluginSource)},`,
    `      "description": ${quoteText(listing.pluginDescription)},`,
    `      "license": ${quoteText(listing.license)},`,
    `      "homepage": ${quoteText(listing.homepage)},`,
    `      "keywords": [${keywords}]`,
    "    }",
  ];
}

export function renderMarketplaceJson(listing: MarketplaceListing): string {
  const lines = [
    "{",
    `  "name": ${quoteText(listing.name)},`,
    '  "owner": {',
    `    "name": ${quoteText(listing.owner.name)},`,
    `    "url": ${quoteText(listing.owner.url)}`,
    "  },",
    `  "description": ${quoteText(listing.description)},`,
    '  "plugins": [',
    ...pluginEntryLines(listing),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}
