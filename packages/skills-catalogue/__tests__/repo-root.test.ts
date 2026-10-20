// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRepoRoot, inMutationSandbox, REPO_ROOT } from "./repo-root.js";

describe("findRepoRoot", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nt-repo-root-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("finds the repository root from the package's real __tests__ directory", () => {
    const tests = join(root, "packages", "p", "__tests__");
    mkdirSync(tests, { recursive: true });
    expect(findRepoRoot(tests)).toBe(root);
  });

  it("finds the same root from inside Stryker's package-local sandbox copy", () => {
    const tests = join(root, "packages", "p", ".stryker-tmp", "sandbox-abc123", "__tests__");
    mkdirSync(tests, { recursive: true });
    expect(findRepoRoot(tests)).toBe(root);
  });

  it("throws rather than guessing when no ancestor holds pnpm-workspace.yaml", () => {
    const orphan = mkdtempSync(join(tmpdir(), "nt-no-root-"));
    try {
      expect(() => findRepoRoot(orphan)).toThrow(/pnpm-workspace\.yaml/);
    } finally {
      rmSync(orphan, { recursive: true, force: true });
    }
  });

  it("resolves REPO_ROOT to a directory that holds the fixture", () => {
    expect(REPO_ROOT).toBe(findRepoRoot(import.meta.dirname));
  });
});

// B-121: the sandbox copies only this package, so every path built from REPO_ROOT inside it is the
// LIVE tree. A test that executes a real command against those paths (cold-install-replay's
// `pnpm pack`, run from each real package directory) runs the mutant's command line there.
describe("inMutationSandbox", () => {
  it("recognises a directory inside Stryker's package-local sandbox", () => {
    expect(inMutationSandbox("/r/packages/p/.stryker-tmp/sandbox-abc123/__tests__")).toBe(true);
  });

  it("does not mistake the real tree, or a sibling sharing the prefix, for the sandbox", () => {
    expect(inMutationSandbox("/r/packages/p/__tests__")).toBe(false);
    expect(inMutationSandbox("/r/packages/p/.stryker-tmpx/sandbox-abc123/__tests__")).toBe(false);
    expect(inMutationSandbox("/r/packages/p/x.stryker-tmp/__tests__")).toBe(false);
  });
});
