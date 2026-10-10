// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  findProListing,
  findSkill,
  MARKETPLACE,
  PRO_LISTINGS,
  SKILLS,
} from "../src/catalogue-index.js";
import { renderMarketplaceJson } from "../src/render/marketplace-json.js";

describe("findSkill", () => {
  it("finds a skill by its canonical name", () => {
    expect(findSkill("narrativetrace-doctor")).toBe(SKILLS[0]);
  });

  it("returns undefined for an unknown name", () => {
    expect(findSkill("not-a-real-skill")).toBeUndefined();
  });
});

describe("findProListing", () => {
  it("finds a listing by its canonical name", () => {
    expect(findProListing("narrativetrace-mcp")).toBe(PRO_LISTINGS[1]);
  });

  it("returns undefined for an unknown name", () => {
    expect(findProListing("not-a-real-listing")).toBeUndefined();
  });
});

// The shape of the marketplace listing this repository publishes — no vendor dependency (that is
// the heavy-tier `vendor-validate` task's job). REPO_ROOT-dependent assertions (the plugin source
// directory actually holding every skill page) live in lints.test.ts's drift-check block instead.
describe("MARKETPLACE", () => {
  it("names the marketplace and its one plugin with the runtime slug", () => {
    expect(MARKETPLACE.name).toBe("narrativetrace-typescript");
  });

  it("declares the open licence the pages ship under", () => {
    expect(MARKETPLACE.license).toBe("Apache-2.0");
  });

  it("declares a relative plugin source the vendor accepts", () => {
    expect(MARKETPLACE.pluginSource).toMatch(/^\.\//);
    expect(MARKETPLACE.pluginSource).not.toContain("..");
    expect(MARKETPLACE.pluginSource).not.toContain("\\");
  });

  it("carries search keywords and a homepage", () => {
    expect(MARKETPLACE.keywords).toContain("narrativetrace");
    expect(MARKETPLACE.keywords).toContain("typescript");
    expect(MARKETPLACE.homepage).toMatch(/^https:\/\//);
  });

  it("renders with every key the vendor requires, the plugin source, and no version", () => {
    const rendered = renderMarketplaceJson(MARKETPLACE);
    expect(rendered).toContain('"name": "narrativetrace-typescript"');
    expect(rendered).toContain('"owner"');
    expect(rendered).toContain('"plugins"');
    expect(rendered).toContain('"source": "./.claude"');
    expect(rendered).not.toContain('"version"');
  });

  it("names the one plugin exactly once besides the marketplace itself", () => {
    const rendered = renderMarketplaceJson(MARKETPLACE);
    const nameMentions = rendered.split('"name": "narrativetrace-typescript"');
    expect(nameMentions).toHaveLength(3);
  });
});
