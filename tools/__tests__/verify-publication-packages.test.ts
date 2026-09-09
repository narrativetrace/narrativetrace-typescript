// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { derivePublishablePackages, workspaceGlobs } from "../verify-publication-packages.js";

describe("workspaceGlobs", () => {
  it("reads the packages: list in file order", () => {
    const yaml = 'packages:\n  - "packages/*"\n  - "examples/*"\n\nblockExoticSubdeps: true\n';
    expect(workspaceGlobs(yaml)).toEqual(["packages/*", "examples/*"]);
  });

  it("stops at the first non-list line after the key", () => {
    const yaml = "packages:\n  - packages/*\ntrustPolicy: no-downgrade\n";
    expect(workspaceGlobs(yaml)).toEqual(["packages/*"]);
  });

  it("throws when the file has no packages: key", () => {
    expect(() => workspaceGlobs("trustPolicy: no-downgrade\n")).toThrow(/packages:/);
  });
});

describe("derivePublishablePackages", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "nt-verify-publication-packages-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function writePackage(dir: string, manifest: Record<string, unknown>): void {
    mkdirSync(join(repoRoot, dir), { recursive: true });
    writeFileSync(join(repoRoot, dir, "package.json"), JSON.stringify(manifest));
  }

  it("finds every non-private package under a glob root, skips private ones", () => {
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    writePackage("packages/core", { name: "@nt/core", version: "1.0.0" });
    writePackage("packages/internal-only", {
      name: "@nt/internal-only",
      version: "1.0.0",
      private: true,
    });

    const found = derivePublishablePackages(repoRoot);

    expect(found).toEqual([{ name: "@nt/core", version: "1.0.0", dir: "packages/core" }]);
  });

  it("sorts by package name", () => {
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    writePackage("packages/zeta", { name: "@nt/zeta", version: "1.0.0" });
    writePackage("packages/alpha", { name: "@nt/alpha", version: "1.0.0" });

    expect(derivePublishablePackages(repoRoot).map((p) => p.name)).toEqual([
      "@nt/alpha",
      "@nt/zeta",
    ]);
  });

  it("covers every workspace root named in the yaml, not just the first", () => {
    writeFileSync(
      join(repoRoot, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n  - "examples/*"\n',
    );
    writePackage("packages/core", { name: "@nt/core", version: "1.0.0" });
    writePackage("examples/demo", { name: "@nt/demo", version: "1.0.0" });

    expect(derivePublishablePackages(repoRoot).map((p) => p.name)).toEqual([
      "@nt/core",
      "@nt/demo",
    ]);
  });

  it("throws on a non-private package missing name or version rather than silently dropping it", () => {
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    writePackage("packages/broken", { name: "@nt/broken" });

    expect(() => derivePublishablePackages(repoRoot)).toThrow(/broken/);
  });

  it("returns an empty list for a glob root that does not exist", () => {
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');

    expect(derivePublishablePackages(repoRoot)).toEqual([]);
  });
});
