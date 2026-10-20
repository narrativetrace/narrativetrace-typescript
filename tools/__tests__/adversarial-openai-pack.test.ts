// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Skill } from "@narrativetrace/skills-catalogue";
import { openAiListing } from "@narrativetrace/skills-catalogue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flatPng } from "../../packages/skills-catalogue/__tests__/png-fixtures.js";
import { packageVersion, packageViolations, packPlugin } from "../openai-plugin-pack.js";
import { readZip, writeZip, type ZipEntry } from "../zip-archive.js";

const END_RECORD_BYTES = 22;

function entry(name: string, data: string | Buffer = ""): ZipEntry {
  return { name, data: Buffer.from(data) };
}

function edited(zip: Buffer, edit: (copy: Buffer, end: number) => void): Buffer {
  const copy = Buffer.from(zip);
  edit(copy, copy.length - END_RECORD_BYTES);
  return copy;
}

function withComment(zip: Buffer, comment: string): Buffer {
  const tail = Buffer.from(comment);
  const out = Buffer.concat([zip, tail]);
  out.writeUInt16LE(tail.length, zip.length - 2);
  return out;
}

describe("readZip odd archives", () => {
  it("reads an empty archive as no entries", () => {
    expect(readZip(writeZip([]))).toEqual([]);
  });

  it("reads an archive that carries a trailing comment", () => {
    const zip = withComment(writeZip([entry("a.txt", "hello")]), "built by hand");
    expect(readZip(zip)).toEqual([{ name: "a.txt", data: Buffer.from("hello") }]);
  });

  it("refuses an empty buffer", () => {
    expect(() => readZip(Buffer.alloc(0))).toThrow(/end of central/);
  });

  it("refuses an archive truncated by one byte", () => {
    const zip = writeZip([entry("a.txt", "hello")]);
    expect(() => readZip(zip.subarray(0, zip.length - 1))).toThrow(/end of central/);
  });

  it("refuses a central directory whose first signature is corrupt", () => {
    const zip = writeZip([entry("a.txt", "hello")]);
    const bad = edited(zip, (copy, end) => copy.writeUInt8(0, copy.readUInt32LE(end + 16)));
    expect(() => readZip(bad)).toThrow(/corrupt central directory/);
  });

  it("refuses an end record that claims more entries than the directory holds", () => {
    const zip = writeZip([entry("a.txt", "hello")]);
    const bad = edited(zip, (copy, end) => copy.writeUInt16LE(2, end + 10));
    expect(() => readZip(bad)).toThrow(/corrupt central directory/);
  });
});

describe("readZip unsupported compression", () => {
  it("refuses an entry compressed with a method other than stored or deflated", () => {
    const zip = writeZip([entry("a.txt", "hello")]);
    const bad = edited(zip, (copy, end) =>
      copy.writeUInt16LE(12, copy.readUInt32LE(end + 16) + 10),
    );
    expect(() => readZip(bad)).toThrow(/unsupported compression method 12/);
  });
});

describe("writeZip name boundaries", () => {
  it.each(["a/..", "..", "a/../b", "../x"])("refuses the traversal name %j", (name) => {
    expect(() => writeZip([entry(name)])).toThrow(/unsafe entry name/);
  });

  it.each(["...", "a..b", "..a/b", "a/b.."])("accepts the near-miss name %j", (name) => {
    expect(readZip(writeZip([entry(name)]))[0]?.name).toBe(name);
  });

  it("round-trips a name of exactly 65535 bytes", () => {
    const name = "n".repeat(65535);
    expect(readZip(writeZip([entry(name, "x")]))[0]?.name).toBe(name);
  });

  it("refuses a name one byte longer than the 16-bit length field can hold", () => {
    expect(() => writeZip([entry("n".repeat(65536))])).toThrow();
  });

  it("refuses a Windows drive-absolute name, which extracts outside the root", () => {
    expect(() => writeZip([entry("C:/evil.txt")])).toThrow(/unsafe entry name/);
  });

  it("refuses a name carrying a NUL byte, which extractors truncate", () => {
    expect(() => writeZip([entry("a\u0000b.txt")])).toThrow(/unsafe entry name/);
  });

  it("refuses two names that differ only by case, which collide on case-insensitive disks", () => {
    expect(() => writeZip([entry("A.txt"), entry("a.txt")])).toThrow(/duplicate/);
  });
});

function pkg(manifest: string, extra: ZipEntry[] = []): { zip: Buffer; names: string[] } {
  const entries = [entry("plugin.json", manifest), entry("skills/a/SKILL.md", "page"), ...extra];
  const names = entries.map((e) => e.name).filter((n) => !n.endsWith("/"));
  return { zip: writeZip(entries), names: names.sort() };
}

function problemsOf(manifest: string, extra: ZipEntry[] = []): string[] {
  const { zip, names } = pkg(manifest, extra);
  return packageViolations(zip, names, "1.2.3");
}

describe("packageViolations manifest shape", () => {
  it("finds nothing wrong with a manifest that names no ./ paths at all", () => {
    expect(problemsOf('{"name": "x", "version": "1.2.3"}')).toEqual([]);
  });

  it("does not mistake a longer key ending in version for the version key", () => {
    expect(problemsOf('{"preversion": "1.2.3"}')).toEqual(['plugin.json carries no "version" key']);
  });

  it("reads the version of a minified manifest, which is valid JSON", () => {
    expect(problemsOf('{"version":"1.2.3"}')).toEqual([]);
  });

  it("reads the top-level version even when a nested object declares a version first", () => {
    expect(problemsOf('{"author": {"version": "9.9.9"}, "version": "1.2.3"}')).toEqual([]);
  });

  it("does not read a ./-prefixed string value as a manifest path", () => {
    expect(problemsOf('{"version": "1.2.3", "description": "./notes"}')).toEqual([]);
  });
});

describe("packageViolations forbidden and icon edges", () => {
  it("does not count a bare hooks/ directory entry as forbidden content", () => {
    const { zip, names } = pkg('{"version": "1.2.3"}', [entry("hooks/")]);
    expect(packageViolations(zip, names, "1.2.3")).toEqual([]);
  });

  it("flags a forbidden entry whatever the case of its name", () => {
    expect(problemsOf('{"version": "1.2.3"}', [entry("Hooks/hooks.json")])).toContain(
      "forbidden entry present: Hooks/hooks.json",
    );
  });

  it("does not let a directory entry stand in for a manifest icon path", () => {
    const manifest =
      '{"version": "1.2.3", "extensions": {"com.openai": {"interface": {"logo": "./assets/logo.png"}}}}';
    expect(problemsOf(manifest, [entry("assets/logo.png/")])).toContain(
      "manifest path './assets/logo.png' resolves to no packaged entry",
    );
  });

  it("checks an icon named with an upper-case extension as an icon", () => {
    const manifest =
      '{"version": "1.2.3", "extensions": {"com.openai": {"interface": {"logo": "./assets/logo.PNG"}}}}';
    expect(problemsOf(manifest, [entry("assets/logo.PNG", "text")])).toEqual([
      expect.stringMatching(/assets\/logo\.PNG is not a readable PNG/),
    ]);
  });

  it("reports the entry-set mismatch and the forbidden entry together", () => {
    const zip = writeZip([entry("plugin.json", '{"version": "1.2.3"}'), entry("mcp.json", "{}")]);
    const expected = ["plugin.json"];
    const found = packageViolations(zip, expected, "1.2.3");
    expect(found).toEqual([
      expect.stringMatching(/entries do not match the layout/),
      "forbidden entry present: mcp.json",
    ]);
  });

  it("refuses an empty ZIP with the missing-manifest error, not an empty list", () => {
    expect(() => packageViolations(writeZip([]), [], "1.2.3")).toThrow(/plugin\.json missing/);
  });

  it("accepts a 48 px icon that is a real PNG of the expected square size", () => {
    const manifest =
      '{"version": "1.2.3", "extensions": {"com.openai": {"interface": {"logo": "./assets/logo.png"}}}}';
    expect(problemsOf(manifest, [entry("assets/logo.png", flatPng(48, 48))])).toEqual([]);
  });
});

describe("packPlugin path and name hazards", () => {
  let root: string;
  let out: string;
  const listing = openAiListing({
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

  function seed(): void {
    put(".agents/skills/a/SKILL.md", "page a");
    put("packages/skills-catalogue/openai-plugin/assets/logo.png", flatPng(64, 64));
    put("packages/skills-catalogue/openai-plugin/assets/composer-icon.png", flatPng(64, 64));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "adv-pack-root-"));
    out = mkdtempSync(join(tmpdir(), "adv-pack-out-"));
    seed();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  it("refuses a skill whose name traverses out of the page root, before any ZIP is written", () => {
    put(".agents/x/SKILL.md", "escaped");
    const skills = [{ canonicalName: "../x" } as unknown as Skill];
    expect(() => packPlugin({ root, outDir: out, version: "1.2.3", skills, listing })).toThrow(
      /unsafe entry name/,
    );
    expect(existsSync(join(out, "narrativetrace-x-openai-plugin-1.2.3.zip"))).toBe(false);
  });

  it("creates a nested output directory that does not exist yet", () => {
    const nested = join(out, "deeper", "still");
    const skills = [{ canonicalName: "a" } as unknown as Skill];
    const { path } = packPlugin({ root, outDir: nested, version: "1.2.3", skills, listing });
    expect(readZip(readFileSync(path))).toHaveLength(4);
  });

  it("refuses the empty version a carrier with an empty version string yields", () => {
    put("packages/skills/package.json", '{"version": ""}');
    const skills = [{ canonicalName: "a" } as unknown as Skill];
    const version = packageVersion(root);
    expect(() => packPlugin({ root, outDir: out, version, skills, listing })).toThrow(
      /not semantic/,
    );
  });

  it("refuses a carrier manifest that is not valid JSON with a SyntaxError", () => {
    put("packages/skills/package.json", "{not json");
    expect(() => packageVersion(root)).toThrow(SyntaxError);
  });

  it("refuses a carrier manifest that is the JSON null with the no-string-version error", () => {
    put("packages/skills/package.json", "null");
    expect(() => packageVersion(root)).toThrow(/no string version/);
  });
});
