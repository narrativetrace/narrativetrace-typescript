// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { OpenAiListingFields, Skill } from "@narrativetrace/skills-catalogue";
import { openAiListing } from "@narrativetrace/skills-catalogue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flatPng } from "../../packages/skills-catalogue/__tests__/png-fixtures.js";
import {
  assertSemanticVersion,
  packageVersion,
  packageViolations,
  packPlugin,
} from "../openai-plugin-pack.js";
import { readZip, writeZip, type ZipEntry } from "../zip-archive.js";

const MANIFEST = (version: string, extra = ""): string =>
  `{\n  "name": "narrativetrace-x",\n  "version": "${version}",\n  "extensions": {"com.openai": {"interface": {"logo": "./assets/logo.png", "composerIcon": "./assets/composer-icon.png"${extra}}}}\n}\n`;

function entry(name: string, data: string | Buffer): ZipEntry {
  return { name, data: Buffer.from(data) };
}

function validEntries(version = "1.2.3"): ZipEntry[] {
  return [
    entry("plugin.json", MANIFEST(version)),
    entry("skills/a/SKILL.md", "page"),
    entry("assets/logo.png", flatPng(64, 64)),
    entry("assets/composer-icon.png", flatPng(64, 64)),
  ];
}

const EXPECTED = validEntries()
  .map((e) => e.name)
  .sort();

function violations(entries: ZipEntry[], version = "1.2.3", expected = EXPECTED): string[] {
  return packageViolations(writeZip(entries), expected, version);
}

function replaced(name: string, data: string | Buffer): ZipEntry[] {
  return validEntries().map((e) => (e.name === name ? entry(name, data) : e));
}

describe("packageViolations", () => {
  it("finds nothing wrong with a package matching its layout", () => {
    expect(violations(validEntries())).toEqual([]);
  });

  it("does not count directory entries as content", () => {
    const withDirs = [...validEntries(), entry("skills/", ""), entry("assets/", "")];
    expect(violations(withDirs)).toEqual([]);
  });

  it("flags a missing expected entry", () => {
    expect(violations(validEntries().filter((e) => e.name !== "skills/a/SKILL.md"))).toEqual([
      expect.stringMatching(/entries do not match the layout.*skills\/a\/SKILL\.md/),
    ]);
  });

  it("flags an entry the layout does not derive", () => {
    expect(violations([...validEntries(), entry("skills/b/SKILL.md", "x")])).toEqual([
      expect.stringMatching(/entries do not match the layout/),
    ]);
  });

  it.each([
    "hooks/hooks.json",
    "mcp.json",
    "thing.app.json",
    "node_modules/x/index.js",
  ])("flags the forbidden entry %s", (name) => {
    const found = violations([...validEntries(), entry(name, "x")]);
    expect(found).toContain(`forbidden entry present: ${name}`);
  });

  it.each([
    "hooks.md",
    "hookshot/x",
    "mcp.json5",
    "app.json",
    "x.app.jsonc",
    "node_modules_old/x",
  ])("does not call the near-miss sibling %s forbidden", (name) => {
    const found = violations([...validEntries(), entry(name, "x")]);
    expect(found.filter((v) => v.startsWith("forbidden"))).toEqual([]);
  });

  it.each([
    "1.2",
    "1.2.3-SNAPSHOT",
    "v1.2.3",
    "1.2.3.4",
    "",
    "01.2.3x",
  ])("flags the non-semantic version %j", (version) => {
    expect(violations(validEntries(), version)).toContainEqual(
      expect.stringMatching(/is not semantic/),
    );
  });

  it("flags a manifest version that differs from the expected one", () => {
    expect(violations(validEntries("1.2.4"))).toEqual([
      "plugin.json version '1.2.4' does not equal 1.2.3",
    ]);
  });

  it("flags a manifest without a version", () => {
    const noVersion = MANIFEST("x").replace('  "version": "x",\n', "");
    expect(violations(replaced("plugin.json", noVersion))).toEqual([
      'plugin.json carries no "version" key',
    ]);
  });

  it("flags a manifest path that resolves to no entry", () => {
    const manifest = MANIFEST("1.2.3", ', "extra": "./assets/missing.png"');
    expect(violations(replaced("plugin.json", manifest))).toContain(
      "manifest path './assets/missing.png' resolves to no packaged entry",
    );
  });

  it("flags an icon larger than five mebibytes and accepts one of exactly five", () => {
    const five = 5 * 1024 * 1024;
    const pad = (size: number): Buffer =>
      Buffer.concat([flatPng(64, 64), Buffer.alloc(size - flatPng(64, 64).length)]);
    expect(violations(replaced("assets/logo.png", pad(five)))).toEqual([]);
    expect(violations(replaced("assets/logo.png", pad(five + 1)))).toEqual([
      "assets/logo.png is larger than 5 MiB",
    ]);
  });

  it("flags a non-square icon", () => {
    expect(violations(replaced("assets/logo.png", flatPng(64, 48)))).toEqual([
      "assets/logo.png is not square (64x48)",
    ]);
  });

  it("flags an icon of 47 px and accepts one of exactly 48", () => {
    expect(violations(replaced("assets/logo.png", flatPng(48, 48)))).toEqual([]);
    expect(violations(replaced("assets/logo.png", flatPng(47, 47)))).toEqual([
      "assets/logo.png is smaller than 48px (47px)",
    ]);
  });

  it("flags an icon that is not a PNG at all", () => {
    expect(violations(replaced("assets/logo.png", "text"))).toEqual([
      expect.stringMatching(/^assets\/logo\.png is not a readable PNG/),
    ]);
  });

  it("throws when the package carries no manifest", () => {
    expect(() => violations(validEntries().filter((e) => e.name !== "plugin.json"))).toThrow(
      /plugin\.json missing/,
    );
  });
});

describe("assertSemanticVersion", () => {
  it.each(["0.0.0", "1.2.3", "10.20.30"])("accepts %s", (v) => {
    expect(() => assertSemanticVersion(v)).not.toThrow();
  });

  it.each(["1.2", "1.2.3-rc.1", "1.2.3\n", " 1.2.3", "1.2.3+build"])("refuses %j", (v) => {
    expect(() => assertSemanticVersion(v)).toThrow(/not semantic/);
  });
});

describe("packPlugin", () => {
  let root: string;
  let out: string;
  const skill = { canonicalName: "a" } as unknown as Skill;
  const listing: OpenAiListingFields = openAiListing({
    base: {
      name: "narrativetrace-x",
      owner: { name: "NarrativeTrace", url: "https://narrativetrace.ai" },
      description: "d",
      pluginDescription: "p",
      pluginSource: "./pages",
      license: "Apache-2.0",
      homepage: "https://narrativetrace.ai",
      keywords: ["k"],
    },
    displayName: "NarrativeTrace for X",
    shortDescription: "Agent skills for X",
    category: "Developer Tools",
    capabilities: ["Read"],
    defaultPrompts: ["p"],
    brandColor: "#4A4A4A",
    websiteUrl: "https://narrativetrace.ai",
  });

  function put(relative: string, data: string | Buffer): void {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "openai-pack-root-"));
    out = mkdtempSync(join(tmpdir(), "openai-pack-out-"));
    put(".agents/skills/a/SKILL.md", "page a");
    put("packages/skills-catalogue/openai-plugin/assets/logo.png", flatPng(64, 64));
    put("packages/skills-catalogue/openai-plugin/assets/composer-icon.png", flatPng(64, 64));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  it("writes <listing name>-openai-plugin-<version>.zip holding exactly the derived entries", () => {
    const { path, entries } = packPlugin({
      root,
      outDir: out,
      version: "1.2.3",
      skills: [skill],
      listing,
    });
    expect(path).toBe(join(out, "narrativetrace-x-openai-plugin-1.2.3.zip"));
    expect(entries).toEqual([
      "assets/composer-icon.png",
      "assets/logo.png",
      "plugin.json",
      "skills/a/SKILL.md",
    ]);
    expect(
      readZip(readFileSync(path))
        .map((e) => e.name)
        .sort(),
    ).toEqual(entries);
  });

  it("carries the .agents flavour of each page and the versioned manifest", () => {
    const { path } = packPlugin({ root, outDir: out, version: "1.2.3", skills: [skill], listing });
    const byName = new Map(readZip(readFileSync(path)).map((e) => [e.name, e.data]));
    expect(byName.get("skills/a/SKILL.md")?.toString()).toBe("page a");
    expect(JSON.parse(String(byName.get("plugin.json"))).version).toBe("1.2.3");
  });

  it("builds the same bytes twice", () => {
    const args = { root, outDir: out, version: "1.2.3", skills: [skill], listing };
    const first = readFileSync(packPlugin(args).path);
    expect(readFileSync(packPlugin(args).path).equals(first)).toBe(true);
  });

  it("refuses a non-semantic version before writing anything", () => {
    expect(() =>
      packPlugin({ root, outDir: out, version: "1.2.3-SNAPSHOT", skills: [skill], listing }),
    ).toThrow(/not semantic/);
    expect(existsSync(join(out, "narrativetrace-x-openai-plugin-1.2.3-SNAPSHOT.zip"))).toBe(false);
  });

  it("names a catalogue skill whose page is missing on disk", () => {
    const extra = { canonicalName: "b" } as unknown as Skill;
    expect(() =>
      packPlugin({ root, outDir: out, version: "1.2.3", skills: [skill, extra], listing }),
    ).toThrow(/skills\/b\/SKILL\.md/);
  });

  it("names a missing asset", () => {
    rmSync(join(root, "packages/skills-catalogue/openai-plugin/assets/logo.png"));
    expect(() =>
      packPlugin({ root, outDir: out, version: "1.2.3", skills: [skill], listing }),
    ).toThrow(/assets\/logo\.png/);
  });

  it("refuses an undersized asset after packing, and leaves no zip behind", () => {
    put("packages/skills-catalogue/openai-plugin/assets/logo.png", flatPng(32, 32));
    expect(() =>
      packPlugin({ root, outDir: out, version: "1.2.3", skills: [skill], listing }),
    ).toThrow(/smaller than 48px/);
    expect(existsSync(join(out, "narrativetrace-x-openai-plugin-1.2.3.zip"))).toBe(false);
  });
});

describe("packageVersion", () => {
  it("reads the published skills carrier's version from the repository", () => {
    const carrier = JSON.parse(readFileSync("packages/skills/package.json", "utf-8"));
    expect(packageVersion(".")).toBe(carrier.version);
  });

  it("refuses a carrier manifest with no string version", () => {
    const dir = mkdtempSync(join(tmpdir(), "openai-pack-version-"));
    try {
      mkdirSync(join(dir, "packages/skills"), { recursive: true });
      writeFileSync(join(dir, "packages/skills/package.json"), '{"version": 3}');
      expect(() => packageVersion(dir)).toThrow(/no string version/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
