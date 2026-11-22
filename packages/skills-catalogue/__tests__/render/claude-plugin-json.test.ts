// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import type { ClaudeListing } from "../../src/claude-listing.js";
import type { MarketplaceListing } from "../../src/marketplace-listing.js";
import {
  CLAUDE_PLUGIN_ICON_PATH,
  renderClaudePluginJson,
} from "../../src/render/claude-plugin-json.js";

function base(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    name: "narrativetrace-x",
    owner: { name: "NarrativeTrace", url: "https://narrativetrace.ai" },
    description: "The marketplace description.",
    pluginDescription: "The plugin description.",
    pluginSource: "./.claude",
    license: "Apache-2.0",
    homepage: "https://narrativetrace.ai",
    repository: "https://github.com/narrativetrace/narrativetrace-x",
    keywords: ["tracing", "agent-skills"],
    ...overrides,
  };
}

function listing(overrides: Partial<MarketplaceListing> = {}): ClaudeListing {
  return {
    base: base(overrides),
    displayName: "NarrativeTrace for X",
    supportUrl: "https://github.com/narrativetrace/narrativetrace-x/issues",
    privacyPolicyUrl: "https://narrativetrace.ai/privacy",
    documentationUrl: "https://github.com/narrativetrace/narrativetrace-x/tree/main/documentation",
  };
}

describe("renderClaudePluginJson", () => {
  it("renders the manifest from the listing alone, keys in the family's order", () => {
    expect(renderClaudePluginJson(listing())).toBe(
      [
        "{",
        '  "name": "narrativetrace-x",',
        '  "description": "The plugin description.",',
        '  "author": {',
        '    "name": "NarrativeTrace"',
        "  },",
        '  "homepage": "https://narrativetrace.ai",',
        '  "repository": "https://github.com/narrativetrace/narrativetrace-x",',
        '  "license": "Apache-2.0",',
        '  "keywords": ["tracing", "agent-skills"],',
        '  "displayName": "NarrativeTrace for X",',
        '  "supportUrl": "https://github.com/narrativetrace/narrativetrace-x/issues",',
        '  "privacyPolicyUrl": "https://narrativetrace.ai/privacy",',
        '  "documentationUrl": "https://github.com/narrativetrace/narrativetrace-x/tree/main/documentation",',
        '  "icon": "./.claude-plugin/icon.png"',
        "}",
        "",
      ].join("\n"),
    );
  });

  it("names the icon relative to the plugin root", () => {
    expect(CLAUDE_PLUGIN_ICON_PATH).toBe("./.claude-plugin/icon.png");
  });

  it("carries no version key and no version literal", () => {
    const rendered = renderClaudePluginJson(listing());
    expect(rendered).not.toContain('"version"');
    expect(rendered).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("renders byte-identically every time", () => {
    expect(renderClaudePluginJson(listing())).toBe(renderClaudePluginJson(listing()));
  });

  it("escapes every character JSON cannot carry raw", () => {
    const rendered = renderClaudePluginJson(
      listing({
        pluginDescription: 'A "quoted" \\ line\nwith a newline.',
        owner: { name: 'Narrative "Trace"', url: "https://narrativetrace.ai" },
      }),
    );
    const parsed = JSON.parse(rendered);
    expect(parsed.description).toBe('A "quoted" \\ line\nwith a newline.');
    expect(parsed.author.name).toBe('Narrative "Trace"');
  });
});
