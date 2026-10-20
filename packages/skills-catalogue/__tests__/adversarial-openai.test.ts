// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import type { MarketplaceListing } from "../src/marketplace-listing.js";
import { type OpenAiListingFields, openAiListing } from "../src/openai-listing.js";
import { openAiPackageEntries } from "../src/render/openai-package-layout.js";
import { renderOpenAiPluginJson } from "../src/render/openai-plugin-json.js";
import { pngDimensions } from "../src/render/png-dimensions.js";
import type { Skill } from "../src/skill.js";
import { flatPng } from "./png-fixtures.js";

const BASE: MarketplaceListing = {
  name: "narrativetrace-x",
  owner: { name: "NarrativeTrace", url: "https://narrativetrace.ai" },
  description: "The marketplace description.",
  pluginDescription: "The plugin description.",
  pluginSource: "./.claude",
  license: "Apache-2.0",
  homepage: "https://narrativetrace.ai",
  keywords: ["tracing"],
};

function fields(overrides: Partial<OpenAiListingFields> = {}): OpenAiListingFields {
  return {
    base: BASE,
    displayName: "NarrativeTrace for X",
    shortDescription: "NarrativeTrace skills for X",
    category: "Developer Tools",
    capabilities: ["Read"],
    defaultPrompts: ["add narrative tracing"],
    brandColor: "#4A4A4A",
    websiteUrl: "https://narrativetrace.ai",
    ...overrides,
  };
}

function listing(overrides: Partial<OpenAiListingFields> = {}): OpenAiListingFields {
  return openAiListing(fields(overrides));
}

function skill(canonicalName: string): Skill {
  return { canonicalName } as unknown as Skill;
}

describe("openAiListing field length boundaries", () => {
  it("accepts a one-character displayName and shortDescription", () => {
    expect(() => openAiListing(fields({ displayName: "x", shortDescription: "y" }))).not.toThrow();
  });

  it("refuses a whitespace-only shortDescription that the directory would show blank", () => {
    expect(() => openAiListing(fields({ shortDescription: "   " }))).toThrow(RangeError);
  });

  it("counts UTF-16 units, the conservative reading of the directory's 30-character ceiling", () => {
    expect(() => openAiListing(fields({ displayName: "😀".repeat(16) }))).toThrow(/32/);
    expect(() => openAiListing(fields({ displayName: "😀".repeat(15) }))).not.toThrow();
  });

  it("refuses a whitespace-only shortDescription, which the directory would show blank", () => {
    expect(() => openAiListing(fields({ shortDescription: "   " }))).toThrow(/shortDescription/);
  });
});

describe("openAiListing brandColor near misses", () => {
  it.each(["#4a4a4a", "#abcdef", "#000000"])("accepts the legal colour %s", (colour) => {
    expect(() => openAiListing(fields({ brandColor: colour }))).not.toThrow();
  });

  it.each([
    "#4A4A4A\n",
    "#4A4A4A ",
    "#ABC",
    "#4A4A4AFF",
    "#GGGGGG",
    "4A4A4A",
  ])("refuses the near-miss colour %j", (colour) => {
    expect(() => openAiListing(fields({ brandColor: colour }))).toThrow(/brandColor/);
  });
});

describe("renderOpenAiPluginJson odd but legal inputs", () => {
  it("renders empty capabilities and defaultPrompt as valid empty arrays", () => {
    const block = JSON.parse(
      renderOpenAiPluginJson(listing({ capabilities: [], defaultPrompts: [] })),
    ).extensions["com.openai"].interface;
    expect([block.capabilities, block.defaultPrompt]).toEqual([[], []]);
  });

  it("round-trips a lone surrogate and a line separator through valid JSON", () => {
    const odd = "a\ud800b c";
    const parsed = JSON.parse(renderOpenAiPluginJson(listing({ displayName: odd })));
    expect(parsed.extensions["com.openai"].interface.displayName).toBe(odd);
  });

  it("keeps a version that is not blank but carries spaces, verbatim", () => {
    const parsed = JSON.parse(renderOpenAiPluginJson(listing(), " 1.2.3 "));
    expect(parsed.version).toBe(" 1.2.3 ");
  });

  it("keeps a version containing a quote as valid JSON with the quote intact", () => {
    const parsed = JSON.parse(renderOpenAiPluginJson(listing(), '1"2'));
    expect(parsed.version).toBe('1"2');
  });

  it("refuses a version of only a non-breaking space as blank", () => {
    expect(() => renderOpenAiPluginJson(listing(), " ")).toThrow(RangeError);
  });
});

describe("renderOpenAiPluginJson keyword line-width boundary", () => {
  const keyword = (length: number): string => "k".repeat(length);

  it("keeps a keywords line of exactly 100 columns on one line", () => {
    const json = renderOpenAiPluginJson(listing({ base: { ...BASE, keywords: [keyword(81)] } }));
    expect(json).toContain(`  "keywords": ["${keyword(81)}"],`);
  });

  it("expands a keywords line of 101 columns to one element per line", () => {
    const json = renderOpenAiPluginJson(listing({ base: { ...BASE, keywords: [keyword(82)] } }));
    expect(json).toContain(`  "keywords": [\n    "${keyword(82)}"\n  ],`);
  });
});

describe("renderOpenAiPluginJson injection and empty description", () => {
  it("does not let a displayName forge a logo key", () => {
    const hostile = '", "logo": "./evil.png';
    const block = JSON.parse(renderOpenAiPluginJson(listing({ displayName: hostile }))).extensions[
      "com.openai"
    ].interface;
    expect([block.logo, block.displayName]).toEqual(["./assets/logo.png", hostile]);
  });
});

describe("openAiPackageEntries near-miss and odd inputs", () => {
  it("does not treat a canonical name that prefixes another as a duplicate", () => {
    const entries = openAiPackageEntries([skill("a"), skill("ab"), skill("a-b")], listing());
    expect(entries).toEqual(
      expect.arrayContaining(["skills/a/SKILL.md", "skills/ab/SKILL.md", "skills/a-b/SKILL.md"]),
    );
  });

  it("refuses a duplicate that is not adjacent to its first occurrence", () => {
    const skills = [skill("a"), skill("b"), skill("a")];
    expect(() => openAiPackageEntries(skills, listing())).toThrow(
      "duplicate skill canonicalName (case-insensitively): a",
    );
  });

  it("refuses a null listing with a TypeError", () => {
    expect(() => openAiPackageEntries([], null as never)).toThrow(TypeError);
  });

  it("does not mutate the skills array it is given", () => {
    const skills = [skill("b"), skill("a")];
    openAiPackageEntries(skills, listing());
    expect(skills.map((s) => s.canonicalName)).toEqual(["b", "a"]);
  });

  it("refuses two canonical names that differ only by case, which collide on case-insensitive disks", () => {
    expect(() => openAiPackageEntries([skill("Foo"), skill("foo")], listing())).toThrow(
      /duplicate/,
    );
  });
});

describe("pngDimensions odd inputs", () => {
  it("reads the largest possible uint32 dimensions", () => {
    const png = new Uint8Array(flatPng(64, 64));
    new DataView(png.buffer).setUint32(16, 0xffffffff);
    expect(pngDimensions(png)).toEqual({ width: 0xffffffff, height: 64 });
  });

  it("reads a PNG that is a view into a larger buffer at a non-zero offset", () => {
    const png = flatPng(48, 96);
    const host = Buffer.concat([Buffer.from("junk!"), png]);
    expect(pngDimensions(host.subarray(5))).toEqual({ width: 48, height: 96 });
  });

  it("refuses a lowercase chunk type that only looks like IHDR", () => {
    const png = new Uint8Array(flatPng(64, 64));
    png[15] = 0x72; // IHDR -> IHDr
    expect(() => pngDimensions(png)).toThrow(/IHDR/);
  });

  it("refuses exactly 23 bytes even when the signature is valid", () => {
    expect(() => pngDimensions(flatPng(48, 48).subarray(0, 23))).toThrow(/too short/);
  });

  it("refuses a signature whose first byte is off by one", () => {
    const png = new Uint8Array(flatPng(64, 64));
    png[0] = 0x88;
    expect(() => pngDimensions(png)).toThrow(/signature/);
  });
});
