// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import type { MarketplaceListing } from "../../src/marketplace-listing.js";
import { renderMarketplaceJson } from "../../src/render/marketplace-json.js";

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

describe("renderMarketplaceJson", () => {
  it("names the marketplace and its owner", () => {
    const parsed = JSON.parse(renderMarketplaceJson(listing()));
    expect(parsed.name).toBe("narrativetrace-x");
    expect(parsed.owner).toEqual({ name: "NarrativeTrace", url: "https://narrativetrace.ai" });
  });

  it("carries one relative-path plugin entry rooted at the rendered pages", () => {
    const parsed = JSON.parse(renderMarketplaceJson(listing()));
    expect(parsed.plugins).toEqual([
      {
        name: "narrativetrace-x",
        source: "./.claude",
        description: "The plugin description.",
        license: "Apache-2.0",
        homepage: "https://narrativetrace.ai",
        keywords: ["tracing", "agent-skills"],
      },
    ]);
  });

  it("renders byte-identically every time", () => {
    expect(renderMarketplaceJson(listing())).toBe(renderMarketplaceJson(listing()));
  });

  it("carries no version key or literal anywhere", () => {
    const rendered = renderMarketplaceJson(listing());
    expect(rendered).not.toContain('"version"');
    expect(rendered).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("ends with exactly one trailing newline", () => {
    expect(renderMarketplaceJson(listing())).toMatch(/[^\n]\n$/);
  });

  it("escapes a quote, backslash, and newline in a hostile description", () => {
    const hostile = listing({ description: 'A "quoted" \\ name\nwith a newline.' });
    const rendered = renderMarketplaceJson(hostile);
    expect(JSON.parse(rendered).description).toBe('A "quoted" \\ name\nwith a newline.');
  });
});
