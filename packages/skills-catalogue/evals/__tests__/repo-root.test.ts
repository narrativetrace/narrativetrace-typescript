// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { repoRootOf } from "../repo-root.js";

describe("repoRootOf", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "nt-repo-root-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("finds the workspace root from a Stryker-sandbox-shaped directory, however deep", () => {
    writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages: []\n");
    const deep = join(tmp, "packages/skills-catalogue/.stryker-tmp/sandbox-1/evals/__tests__");
    mkdirSync(deep, { recursive: true });
    expect(repoRootOf(deep)).toBe(tmp);
  });

  it("returns the directory itself when it holds the marker", () => {
    writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages: []\n");
    expect(repoRootOf(tmp)).toBe(tmp);
  });

  it("answers with the nearest marker when workspaces nest", () => {
    writeFileSync(join(tmp, "pnpm-workspace.yaml"), "");
    mkdirSync(join(tmp, "inner/sub"), { recursive: true });
    writeFileSync(join(tmp, "inner/pnpm-workspace.yaml"), "");
    expect(repoRootOf(join(tmp, "inner/sub"))).toBe(join(tmp, "inner"));
  });

  it("refuses a path with no marker above it, naming the marker", () => {
    expect(() => repoRootOf("/")).toThrow(/pnpm-workspace\.yaml/);
  });
});
