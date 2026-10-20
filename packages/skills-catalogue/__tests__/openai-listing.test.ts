// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import type { MarketplaceListing } from "../src/marketplace-listing.js";
import {
  MAX_LISTING_FIELD_LENGTH,
  type OpenAiListingFields,
  openAiListing,
} from "../src/openai-listing.js";

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

function fields(overrides: Partial<OpenAiListingFields> = {}): OpenAiListingFields {
  return {
    base: BASE,
    displayName: "NarrativeTrace for X",
    shortDescription: "NarrativeTrace skills for X",
    category: "Developer Tools",
    capabilities: ["Read", "Write"],
    defaultPrompts: ["add narrative tracing to my service"],
    brandColor: "#4A4A4A",
    websiteUrl: "https://narrativetrace.ai",
    ...overrides,
  };
}

describe("openAiListing", () => {
  it("carries the base listing and the directory-only fields", () => {
    const listing = openAiListing(fields());
    expect(listing.base).toBe(BASE);
    expect(listing.displayName).toBe("NarrativeTrace for X");
    expect(listing.shortDescription).toBe("NarrativeTrace skills for X");
    expect(listing.category).toBe("Developer Tools");
    expect(listing.capabilities).toEqual(["Read", "Write"]);
    expect(listing.defaultPrompts).toEqual(["add narrative tracing to my service"]);
    expect(listing.brandColor).toBe("#4A4A4A");
    expect(listing.websiteUrl).toBe("https://narrativetrace.ai");
  });

  it("accepts a thirty-character displayName and shortDescription", () => {
    const thirty = "x".repeat(MAX_LISTING_FIELD_LENGTH);
    const listing = openAiListing(fields({ displayName: thirty, shortDescription: thirty }));
    expect(listing.displayName).toHaveLength(30);
    expect(listing.shortDescription).toHaveLength(30);
  });

  it("rejects a thirty-one-character displayName naming the field and the ceiling", () => {
    expect(() => openAiListing(fields({ displayName: "x".repeat(31) }))).toThrow(
      /displayName.*30.*31/,
    );
  });

  it("rejects a thirty-one-character shortDescription naming the field and the ceiling", () => {
    expect(() => openAiListing(fields({ shortDescription: "x".repeat(31) }))).toThrow(
      /shortDescription.*30.*31/,
    );
  });

  it("rejects an empty displayName, which the directory cannot show", () => {
    expect(() => openAiListing(fields({ displayName: "" }))).toThrow(/displayName/);
  });

  it("copies the lists so a later mutation of the input cannot change the listing", () => {
    const capabilities = ["Read"];
    const listing = openAiListing(fields({ capabilities }));
    capabilities.push("Write");
    expect(listing.capabilities).toEqual(["Read"]);
  });

  it("rejects a brandColor that is not a six-digit hex colour", () => {
    expect(() => openAiListing(fields({ brandColor: "grey" }))).toThrow(/brandColor/);
  });
});
