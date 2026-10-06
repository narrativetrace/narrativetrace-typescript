// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { findProListing, findSkill, PRO_LISTINGS, SKILLS } from "../src/catalogue-index.js";

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
