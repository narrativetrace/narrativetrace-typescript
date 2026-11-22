// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_DIRECTORY, MARKETPLACE } from "../src/catalogue-index.js";
import { renderClaudePluginJson } from "../src/render/claude-plugin-json.js";
import { OPENAI_PLUGIN_ROOT } from "../src/render/openai-plugin-json.js";
import { pngDimensions } from "../src/render/png-dimensions.js";
import { REPO_ROOT } from "./repo-root.js";

// The plugin folder carries its own plugin.json, and the root marketplace entry for the same plugin
// carries display fields too. Claude Code combines the two (the entry's `strict` defaults to true)
// and the directory reads the manifest alone, so the two must say the same thing about the plugin.
// Both come from the one MarketplaceListing; this pins that on the COMMITTED files, so a hand edit
// of either fails here. Mirrors the Java ClaudePluginAgreesWithMarketplaceTest.

const MANIFEST_PATH = ".claude/.claude-plugin/plugin.json";
const ICON_PATH = ".claude/.claude-plugin/icon.png";
const manifestText = readFileSync(join(REPO_ROOT, MANIFEST_PATH), "utf-8");
const manifest = JSON.parse(manifestText);
const marketplaceText = readFileSync(join(REPO_ROOT, ".claude-plugin/marketplace.json"), "utf-8");
const entry = JSON.parse(marketplaceText).plugins[0];

describe("the committed Claude plugin manifest", () => {
  it("is the render of the typed listing", () => {
    expect(manifestText).toBe(renderClaudePluginJson(CLAUDE_DIRECTORY));
  });

  it("agrees with the marketplace entry on every shared field", () => {
    for (const field of ["name", "description", "license", "homepage", "keywords"] as const) {
      expect(manifest[field], field).toEqual(entry[field]);
    }
    expect(manifest.name).toBe("narrativetrace-typescript");
  });

  it("is the manifest of the folder the marketplace entry's source names", () => {
    expect(entry.source).toBe("./.claude");
    expect(MARKETPLACE.pluginSource).toBe("./.claude");
  });

  it("names the public repository the listing carries", () => {
    expect(manifest.repository).toBe("https://github.com/narrativetrace/narrativetrace-typescript");
  });

  it("keeps the exact key order and an author object", () => {
    expect(Object.keys(manifest)).toEqual([
      "name",
      "description",
      "author",
      "homepage",
      "repository",
      "license",
      "keywords",
      "displayName",
      "supportUrl",
      "privacyPolicyUrl",
      "documentationUrl",
      "icon",
    ]);
    expect(manifest.author).toEqual({ name: "NarrativeTrace" });
    expect(manifest.license).toBe("Apache-2.0");
    expect(manifest.icon).toBe("./.claude-plugin/icon.png");
    expect(manifest).not.toHaveProperty("version");
  });

  it("adds no components to the marketplace entry and leaves strict at its default", () => {
    for (const key of [
      "commands",
      "agents",
      "skills",
      "hooks",
      "mcpServers",
      "outputStyles",
      "themes",
      "strict",
    ]) {
      expect(entry, key).not.toHaveProperty(key);
    }
  });

  it("names the directory listing fields only in the manifest", () => {
    expect(entry).not.toHaveProperty("icon");
  });
});

describe("the committed Claude plugin icon", () => {
  const icon = readFileSync(join(REPO_ROOT, ICON_PATH));

  it("is byte-identical to the OpenAI package's logo", () => {
    const logo = readFileSync(join(REPO_ROOT, OPENAI_PLUGIN_ROOT, "assets/logo.png"));
    expect(Buffer.compare(icon, logo)).toBe(0);
  });

  it("is a square PNG of 512 to 2048 pixels under 2 MB, as the directory asks", () => {
    const { width, height } = pngDimensions(icon);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(512);
    expect(width).toBeLessThanOrEqual(2048);
    expect(icon.length).toBeLessThan(2 * 1024 * 1024);
  });
});
