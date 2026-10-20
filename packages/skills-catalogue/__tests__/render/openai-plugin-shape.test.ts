// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETPLACE, OPENAI_DIRECTORY } from "../../src/catalogue-index.js";
import { OPENAI_PLUGIN_ROOT, renderOpenAiPluginJson } from "../../src/render/openai-plugin-json.js";
import { pngDimensions } from "../../src/render/png-dimensions.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "../repo-root.js";

// The offline stand-in for the vendor's own plugin schema (CI never fetches it; the portal's
// validation on the first upload is the by-hand check): every top-level key is one the schema
// allows, the two required keys are present, `name` matches the schema's own pattern, and the
// skills-only rules hold (no `version` in the committed file, no `hooks`/`apps`).

/** The schema's ten top-level keys (agent-plugins.org/schemas/1.0.0/plugin.schema.json). */
const SCHEMA_TOP_LEVEL_KEYS = [
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
];

/**
 * Copied from the schema's `name` pattern (agent-plugins.org/schemas/1.0.0/plugin.schema.json),
 * verified 2026-10-17: lower-case alphanumerics, `.` and `-`, never starting or ending with a
 * separator and never carrying `--` or `..`.
 */
const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

const committed = renderOpenAiPluginJson(OPENAI_DIRECTORY);
const manifest = JSON.parse(committed) as Record<string, unknown>;

describe("the OpenAI plugin manifest's shape", () => {
  it("uses only top-level keys the schema allows", () => {
    expect(SCHEMA_TOP_LEVEL_KEYS).toEqual(expect.arrayContaining(Object.keys(manifest)));
  });

  it("carries the two required keys", () => {
    expect(manifest).toHaveProperty("$schema");
    expect(manifest).toHaveProperty("name");
  });

  it("names the plugin with a value the schema's pattern accepts", () => {
    expect(manifest.name).toBe(MARKETPLACE.name);
    expect(NAME_PATTERN.test(String(manifest.name))).toBe(true);
  });

  it.each([
    "Narrative",
    "-x",
    "x-",
    "a--b",
    "a..b",
    "",
    "a b",
  ])("the copied name pattern rejects the near-miss %j", (name) => {
    expect(NAME_PATTERN.test(name)).toBe(false);
  });

  it("carries no version key in the committed render", () => {
    expect(manifest).not.toHaveProperty("version");
  });

  it("carries no hooks or apps key at any depth", () => {
    expect(committed).not.toContain('"hooks"');
    expect(committed).not.toContain('"apps"');
  });
});

describe.skipIf(!REPO_ROOT_REACHABLE)("the committed manifest file", () => {
  it("parses as JSON with exactly the rendered top-level keys", () => {
    const onDisk = readFileSync(join(REPO_ROOT, OPENAI_PLUGIN_ROOT, "plugin.json"), "utf-8");
    expect(Object.keys(JSON.parse(onDisk))).toEqual(Object.keys(manifest));
  });
});

/** Every `"./..."` path the manifest names, relative to the package (ZIP) root. */
function manifestPaths(): string[] {
  return [...committed.matchAll(/"\.\/([^"]+)"/g)].map((match) => match[1] as string);
}

describe.skipIf(!REPO_ROOT_REACHABLE)("the listing assets the manifest names", () => {
  const packageRoot = join(REPO_ROOT, OPENAI_PLUGIN_ROOT);

  it("names exactly the logo and the composer icon, under assets/", () => {
    expect(manifestPaths()).toEqual(["assets/logo.png", "assets/composer-icon.png"]);
  });

  it.each(manifestPaths())("%s exists in the package root", (path) => {
    expect(existsSync(join(packageRoot, path))).toBe(true);
  });

  it.each(manifestPaths())("%s is a square PNG of at least 48 px and at most 5 MiB", (path) => {
    const file = join(packageRoot, path);
    const { width, height } = pngDimensions(readFileSync(file));
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(48);
    expect(statSync(file).size).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
});
