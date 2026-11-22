// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SKILLS } from "../src/catalogue-index.js";
import { REPO_ROOT } from "./repo-root.js";

// The directory rejects `allowed-tools` beyond Read/Grep/Glob/LS from an unverified publisher
// (owner ruling 2026-11-19): not one committed Claude page, in the repository or in either carrier,
// may carry the key. Mirrors the Java RenderDriftTest.

const CLAUDE_ROOTS = [".claude/skills", "packages/skills/claude", "packages/cli/skills/claude"];

describe("committed Claude pages", () => {
  it.each(CLAUDE_ROOTS)("%s carries a page per skill and no allowed-tools line", (root) => {
    const names = readdirSync(join(REPO_ROOT, root)).sort();
    expect(names).toEqual(SKILLS.map((skill) => skill.canonicalName).sort());
    for (const name of names) {
      const page = readFileSync(join(REPO_ROOT, root, name, "SKILL.md"), "utf-8");
      expect(page, `${root}/${name}`).not.toMatch(/^allowed-tools:/m);
      expect(page, `${root}/${name}`).not.toContain("allowed-tools");
    }
  });
});
