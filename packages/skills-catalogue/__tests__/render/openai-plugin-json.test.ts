// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import type { MarketplaceListing } from "../../src/marketplace-listing.js";
import { type OpenAiListingFields, openAiListing } from "../../src/openai-listing.js";
import { renderOpenAiPluginJson } from "../../src/render/openai-plugin-json.js";

const BASE: MarketplaceListing = {
  name: "narrativetrace-x",
  owner: { name: "NarrativeTrace", url: "https://narrativetrace.ai" },
  description: "The marketplace description.",
  pluginDescription: "The plugin description.",
  pluginSource: "./.claude",
  license: "Apache-2.0",
  homepage: "https://narrativetrace.ai",
  keywords: ["tracing", "agent-skills"],
};

function listing(overrides: Partial<OpenAiListingFields> = {}): OpenAiListingFields {
  return openAiListing({
    base: BASE,
    displayName: "NarrativeTrace for X",
    shortDescription: "NarrativeTrace skills for X",
    category: "Developer Tools",
    capabilities: ["Read", "Write"],
    defaultPrompts: ["do the thing", "do the other thing"],
    brandColor: "#4A4A4A",
    websiteUrl: "https://narrativetrace.ai",
    ...overrides,
  });
}

function iface(json: string): Record<string, unknown> {
  return JSON.parse(json).extensions["com.openai"].interface;
}

describe("renderOpenAiPluginJson", () => {
  it("maps the base listing onto the manifest's top-level keys", () => {
    const parsed = JSON.parse(renderOpenAiPluginJson(listing()));
    expect(parsed.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(parsed.name).toBe("narrativetrace-x");
    expect(parsed.description).toBe("The plugin description.");
    expect(parsed.author).toEqual({ name: "NarrativeTrace" });
    expect(parsed.homepage).toBe("https://narrativetrace.ai");
    expect(parsed.license).toBe("Apache-2.0");
    expect(parsed.keywords).toEqual(["tracing", "agent-skills"]);
  });

  it("maps the directory-only fields onto the com.openai interface block", () => {
    const block = iface(renderOpenAiPluginJson(listing()));
    expect(block).toMatchObject({
      displayName: "NarrativeTrace for X",
      shortDescription: "NarrativeTrace skills for X",
      developerName: "NarrativeTrace",
      category: "Developer Tools",
      capabilities: ["Read", "Write"],
      defaultPrompt: ["do the thing", "do the other thing"],
      brandColor: "#4A4A4A",
      websiteURL: "https://narrativetrace.ai",
      logo: "./assets/logo.png",
      composerIcon: "./assets/composer-icon.png",
    });
  });

  it("states the environment in the long description without claiming more than one run", () => {
    const long = String(iface(renderOpenAiPluginJson(listing())).longDescription);
    expect(long.startsWith("The plugin description. ")).toBe(true);
    expect(long).toContain("reads what one run actually did");
    expect(long).toContain("Node.js");
  });

  it("carries no version key in the committed render", () => {
    expect(renderOpenAiPluginJson(listing())).not.toContain('"version"');
  });

  it("differs from the packaged render only by the version line", () => {
    const committed = renderOpenAiPluginJson(listing());
    const packaged = renderOpenAiPluginJson(listing(), "1.2.3");
    expect(JSON.parse(packaged).version).toBe("1.2.3");
    expect(packaged.replace('  "version": "1.2.3",\n', "")).toBe(committed);
  });

  it.each(["", " ", "\t\n"])("refuses the blank version %j", (version) => {
    expect(() => renderOpenAiPluginJson(listing(), version)).toThrow(/version/);
  });

  it("carries none of the keys a skills-only, unfinished listing must omit", () => {
    const rendered = renderOpenAiPluginJson(listing(), "1.2.3");
    for (const key of [
      "hooks",
      "apps",
      "onboardingSkill",
      "requires_local_executor",
      "privacyPolicyURL",
      "termsOfServiceURL",
    ]) {
      expect(rendered).not.toContain(key);
    }
  });

  it("renders byte-identically every time, with one trailing newline", () => {
    expect(renderOpenAiPluginJson(listing())).toBe(renderOpenAiPluginJson(listing()));
    expect(renderOpenAiPluginJson(listing(), "1.2.3")).toBe(
      renderOpenAiPluginJson(listing(), "1.2.3"),
    );
    expect(renderOpenAiPluginJson(listing())).toMatch(/[^\n]\n$/);
  });

  it("keeps a short list on one line and expands a list that would pass the line width", () => {
    const short = renderOpenAiPluginJson(listing());
    expect(short).toContain('"defaultPrompt": ["do the thing", "do the other thing"]');
    const long = renderOpenAiPluginJson(
      listing({ defaultPrompts: ["a".repeat(60), "b".repeat(60)] }),
    );
    expect(long).toContain(`"defaultPrompt": [\n          "${"a".repeat(60)}",\n`);
    expect(JSON.parse(long).extensions["com.openai"].interface.defaultPrompt).toHaveLength(2);
  });

  it("escapes quotes, backslashes, newlines and control characters in every text field", () => {
    const hostile = 'a "q" \\ b\nc\u0001d';
    const parsed = JSON.parse(
      renderOpenAiPluginJson(
        listing({
          base: { ...BASE, owner: { ...BASE.owner, name: hostile }, pluginDescription: hostile },
          category: hostile,
          capabilities: [hostile],
          defaultPrompts: [hostile],
        }),
      ),
    );
    expect(parsed.author.name).toBe(hostile);
    expect(parsed.description).toBe(hostile);
    const block = parsed.extensions["com.openai"].interface;
    expect([
      block.developerName,
      block.category,
      block.capabilities[0],
      block.defaultPrompt[0],
    ]).toEqual([hostile, hostile, hostile, hostile]);
  });

  it("renders an empty keyword list as a valid empty array", () => {
    const parsed = JSON.parse(renderOpenAiPluginJson(listing({ base: { ...BASE, keywords: [] } })));
    expect(parsed.keywords).toEqual([]);
  });
});
