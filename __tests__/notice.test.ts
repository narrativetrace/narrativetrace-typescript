// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OPEN_TIER_PACKAGES } from "../tools/license-tiers.js";

/**
 * NOTICE is a publish-time legal statement, same class as the manifest `license` field
 * __tests__/package-metadata.test.ts gates — gated here against the SAME licence-category
 * source (`tools/license-tiers.ts`) rather than a second, hand-copied list, so a package joining
 * the open tier without a NOTICE update is a failing test, not a silent drift (the exact bug
 * class the Java reference's own NOTICE had before Q2: `licensing.properties` marked four modules
 * `open`, NOTICE named only one).
 */

const REPO_ROOT = join(import.meta.dirname, "..");
const NOTICE_TEXT = readFileSync(join(REPO_ROOT, "NOTICE"), "utf-8");

describe("NOTICE", () => {
  it.each([...OPEN_TIER_PACKAGES])("names @narrativetrace/%s as Apache-licensed", (pkg) => {
    expect(NOTICE_TEXT).toContain(`@narrativetrace/${pkg}`);
  });

  it("names the rendered skill page paths as Apache", () => {
    expect(NOTICE_TEXT).toContain(".claude/skills/**");
    expect(NOTICE_TEXT).toContain(".agents/skills/**");
  });

  it("names the marketplace render target as Apache", () => {
    expect(NOTICE_TEXT).toContain(".claude-plugin/marketplace.json");
  });

  it("states the Apache licence for the section naming the rendered pages", () => {
    const pagesIndex = NOTICE_TEXT.indexOf(".claude/skills/**");
    const sectionAfter = NOTICE_TEXT.slice(pagesIndex, pagesIndex + 300);
    expect(sectionAfter).toContain("Apache License, Version 2.0");
  });

  it("states every other published package is BSL, not silently unlicensed", () => {
    expect(NOTICE_TEXT).toContain("Business Source License 1.1");
  });
});
