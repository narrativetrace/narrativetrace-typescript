// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import type { MarketplaceListing } from "../../src/marketplace-listing.js";
import {
  CURSOR_RULE_PATH,
  CURSOR_SKILLS_PATH,
  renderCursorMarketplaceJson,
  renderCursorPluginJson,
} from "../../src/render/cursor-plugin-json.js";

function listing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    name: "narrativetrace-x",
    owner: { name: "NarrativeTrace", url: "https://narrativetrace.ai" },
    description: "The marketplace description.",
    pluginDescription: "The plugin description.",
    pluginSource: "./.claude",
    license: "Apache-2.0",
    homepage: "https://narrativetrace.ai",
    keywords: ["tracing", "agent-skills"],
    ...overrides,
  };
}

describe("renderCursorPluginJson", () => {
  it("names the plugin with the listing's own name, description, licence and keywords", () => {
    const parsed = JSON.parse(renderCursorPluginJson(listing()));
    expect(parsed.name).toBe("narrativetrace-x");
    expect(parsed.description).toBe("The plugin description.");
    expect(parsed.author).toEqual({ name: "NarrativeTrace" });
    expect(parsed.license).toBe("Apache-2.0");
    expect(parsed.homepage).toBe("https://narrativetrace.ai");
    expect(parsed.keywords).toEqual(["tracing", "agent-skills"]);
  });

  it("carries the open-standard skills directory and the one rule, and nothing else", () => {
    const parsed = JSON.parse(renderCursorPluginJson(listing()));
    expect(parsed.skills).toBe(CURSOR_SKILLS_PATH);
    expect(parsed.rules).toBe(CURSOR_RULE_PATH);
    expect(CURSOR_SKILLS_PATH).toBe("./.agents/skills/");
    expect(CURSOR_RULE_PATH).toBe("./.cursor/rules/narrativetrace.mdc");
    for (const absent of ["commands", "hooks", "agents", "mcpServers", "version"]) {
      expect(parsed).not.toHaveProperty(absent);
    }
  });

  it("never uses the Claude-flavour plugin source", () => {
    expect(renderCursorPluginJson(listing())).not.toContain(".claude");
  });

  it("renders one flat keywords line, as Biome's JSON formatter requires", () => {
    expect(renderCursorPluginJson(listing())).toContain(
      '  "keywords": ["tracing", "agent-skills"],\n',
    );
  });

  it("escapes a hostile description and ends with exactly one newline", () => {
    const rendered = renderCursorPluginJson(listing({ pluginDescription: 'A "q" \\ x\ny' }));
    expect(JSON.parse(rendered).description).toBe('A "q" \\ x\ny');
    expect(rendered).toMatch(/[^\n]\n$/);
  });
});

describe("renderCursorMarketplaceJson", () => {
  it("lists the repository itself as the one plugin, source `.`", () => {
    const parsed = JSON.parse(renderCursorMarketplaceJson(listing()));
    expect(parsed.name).toBe("narrativetrace-x");
    expect(parsed.owner).toEqual({ name: "NarrativeTrace" });
    expect(parsed.metadata).toEqual({ description: "The marketplace description." });
    expect(parsed.plugins).toEqual([
      {
        name: "narrativetrace-x",
        source: ".",
        description: "The plugin description.",
        license: "Apache-2.0",
        homepage: "https://narrativetrace.ai",
        keywords: ["tracing", "agent-skills"],
      },
    ]);
  });

  it("carries no version key or literal anywhere", () => {
    for (const rendered of [
      renderCursorMarketplaceJson(listing()),
      renderCursorPluginJson(listing()),
    ]) {
      expect(rendered).not.toContain('"version"');
      expect(rendered).not.toMatch(/\d+\.\d+\.\d+/);
    }
  });

  it("renders byte-identically every time and ends with one newline", () => {
    expect(renderCursorMarketplaceJson(listing())).toBe(renderCursorMarketplaceJson(listing()));
    expect(renderCursorMarketplaceJson(listing())).toMatch(/[^\n]\n$/);
  });

  it("is laid out one key per line, in the shape Biome's JSON formatter keeps", () => {
    const lines = renderCursorMarketplaceJson(listing()).split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "{",
      '  "name": "narrativetrace-x",',
      '  "owner": {',
      '    "name": "NarrativeTrace"',
    ]);
    expect(lines).toContain('      "source": ".",');
    expect(lines.at(-2)).toBe("}");
  });
});
