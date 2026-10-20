// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { OpenAiListingFields } from "../openai-listing.js";

/**
 * The directory's package root, repository-relative: inside this module on purpose, so the public
 * repository root gains no `plugin.json` a vendor could discover on its own. Holds the committed
 * versionless `plugin.json` and the hand-made `assets/` the release ZIP copies.
 */
export const OPENAI_PLUGIN_ROOT = "packages/skills-catalogue/openai-plugin";

/** The logo's path inside the package (ZIP) root — also its `./`-relative path in the manifest. */
export const LOGO_PATH = "assets/logo.png";

/** The composer icon's path inside the package (ZIP) root. */
export const COMPOSER_ICON_PATH = "assets/composer-icon.png";

const SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

/** Biome's `lineWidth`: a list that would pass it renders one element per line, as Biome would. */
const LINE_WIDTH = 100;

/**
 * Appended to the listing's `pluginDescription` for the directory's `longDescription`: states the
 * environment a skills-only plugin needs, and bounds the claim to what one run showed — never
 * more, the rule `narrativetrace-verify` and `narrativetrace-explain` hold their own reports to.
 */
const ENVIRONMENT_SENTENCE =
  "It reads what one run actually did, and needs Node.js, this project's package manager, and network access for the first dependency fetch.";

function quote(text: string): string {
  return JSON.stringify(text);
}

/**
 * One `"key": [...]` property: on one line when it fits {@link LINE_WIDTH}, else one element per
 * line — the shape Biome's JSON formatter requires of committed build output.
 */
function listProperty(indent: string, key: string, values: readonly string[]): string {
  const inline = `${indent}${quote(key)}: [${values.map(quote).join(", ")}],`;
  if (inline.length <= LINE_WIDTH) return inline;
  const last = values.length - 1;
  const items = values.map((value, i) => `${indent}  ${quote(value)}${i < last ? "," : ""}`);
  return [`${indent}${quote(key)}: [`, ...items, `${indent}],`].join("\n");
}

function interfaceLines(listing: OpenAiListingFields): readonly string[] {
  const indent = "        ";
  const text = (key: string, value: string): string => `${indent}${quote(key)}: ${quote(value)},`;
  const { base } = listing;
  return [
    text("displayName", listing.displayName),
    text("shortDescription", listing.shortDescription),
    text("longDescription", `${base.pluginDescription} ${ENVIRONMENT_SENTENCE}`),
    text("developerName", base.owner.name),
    text("category", listing.category),
    listProperty(indent, "capabilities", listing.capabilities),
    listProperty(indent, "defaultPrompt", listing.defaultPrompts),
    text("brandColor", listing.brandColor),
    text("websiteURL", listing.websiteUrl),
    text("logo", `./${LOGO_PATH}`),
    `${indent}${quote("composerIcon")}: ${quote(`./${COMPOSER_ICON_PATH}`)}`,
  ];
}

function topLevelLines(listing: OpenAiListingFields, version: string | undefined): string[] {
  const { base } = listing;
  return [
    `  "$schema": ${quote(SCHEMA_URL)},`,
    `  "name": ${quote(base.name)},`,
    ...(version === undefined ? [] : [`  "version": ${quote(version)},`]),
    `  "description": ${quote(base.pluginDescription)},`,
    `  "author": {\n    "name": ${quote(base.owner.name)}\n  },`,
    `  "homepage": ${quote(base.homepage)},`,
    `  "license": ${quote(base.license)},`,
    listProperty("  ", "keywords", base.keywords),
  ];
}

/**
 * Renders the OpenAI plugin directory's `plugin.json` (the directory is shared by ChatGPT and
 * Codex) from a {@link OpenAiListingFields}.
 *
 * Without `version` this is the committed, versionless build output the drift test pins — the
 * installed version IS the release that shipped it, the same rule the marketplace file keeps. With
 * `version` it is the packaged text a release ZIP carries (`tools/openai-plugin-pack.ts`); the two
 * differ by exactly the `"version"` line. A blank `version` throws `RangeError`; whether it is
 * semantic is the pack step's check, not this renderer's.
 *
 * Field names follow the vendor's plugin schema (agent-plugins.org, schema 1.0.0) and its
 * `extensions.com.openai.interface` listing fields. Deliberately absent: `hooks`/`apps` (this
 * plugin is skills-only), `onboardingSkill`, `requires_local_executor` (the desktop-only
 * declaration waits on a cloud trial), and `privacyPolicyURL`/`termsOfServiceURL` (narrativetrace.ai
 * carries neither page yet).
 *
 * Built line by line rather than through `JSON.stringify(_, null, 2)` so the committed file already
 * has the shape Biome's formatter requires; `JSON.stringify` still escapes every scalar.
 */
export function renderOpenAiPluginJson(listing: OpenAiListingFields, version?: string): string {
  if (version !== undefined && version.trim() === "") {
    throw new RangeError("version must not be blank");
  }
  const lines = [
    "{",
    ...topLevelLines(listing, version),
    '  "extensions": {',
    '    "com.openai": {',
    '      "interface": {',
    ...interfaceLines(listing),
    "      }",
    "    }",
    "  }",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}
