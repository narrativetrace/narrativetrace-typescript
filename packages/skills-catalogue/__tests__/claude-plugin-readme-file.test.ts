// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETPLACE, SKILLS } from "../src/catalogue-index.js";
import { renderClaudePluginReadme } from "../src/render/claude-plugin-readme.js";
import { REPO_ROOT } from "./repo-root.js";

describe("the committed Claude plugin README", () => {
  it("is the render of the typed catalogue", () => {
    expect(readFileSync(join(REPO_ROOT, ".claude/README.md"), "utf-8")).toBe(
      renderClaudePluginReadme(MARKETPLACE, SKILLS),
    );
  });
});
