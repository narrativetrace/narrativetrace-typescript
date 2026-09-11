// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspacePackage } from "../verify-all-packages.js";
import {
  COVERAGE_EXEMPTIONS,
  checkCoverageCompleteness,
  referencesSharedBaseline,
} from "../verify-coverage-completeness.js";

const BASELINED_CONFIG = `import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.coverage.shared";

export default defineConfig({
  test: { coverage: packageCoverage },
});
`;

const RATCHETED_CONFIG = `import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.coverage.shared";

export default defineConfig({
  test: { coverage: { ...packageCoverage, thresholds: { ...packageCoverage.thresholds, branches: 90 } } },
});
`;

const HARDCODED_CONFIG = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { coverage: { provider: "v8", thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } } },
});
`;

describe("referencesSharedBaseline", () => {
  it("is true for a config that imports and spreads packageCoverage", () => {
    expect(referencesSharedBaseline(BASELINED_CONFIG)).toBe(true);
  });

  it("is true for a documented ratchet that still spreads packageCoverage", () => {
    expect(referencesSharedBaseline(RATCHETED_CONFIG)).toBe(true);
  });

  it("is false for a config with no import of the shared baseline at all", () => {
    expect(referencesSharedBaseline(HARDCODED_CONFIG)).toBe(false);
  });

  it("is false for a config that imports the shared module but never uses packageCoverage", () => {
    const source = `import { packageTestExclude } from "../../vitest.coverage.shared";
export default { test: { exclude: packageTestExclude, coverage: { provider: "v8" } } };`;
    expect(referencesSharedBaseline(source)).toBe(false);
  });

  it("still matches a renamed import, since the import clause keeps the literal text", () => {
    const source = `import { packageCoverage as pc } from "../../vitest.coverage.shared";
export default { test: { coverage: pc } };`;
    expect(referencesSharedBaseline(source)).toBe(true);
  });

  it("documents its own blind spot: an import never wired into coverage: still reads as a pass", () => {
    const source = `import { packageCoverage } from "../../vitest.coverage.shared";
// packageCoverage is imported but this config never actually uses it below.
export default { test: { coverage: { provider: "v8", thresholds: { lines: 10 } } } };`;
    expect(referencesSharedBaseline(source)).toBe(true);
  });
});

describe("checkCoverageCompleteness", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "nt-coverage-completeness-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function writePackage(
    slug: string,
    scripts: Record<string, string>,
    configSource?: string,
  ): WorkspacePackage {
    const dir = join("packages", slug);
    mkdirSync(join(repoRoot, dir), { recursive: true });
    writeFileSync(
      join(repoRoot, dir, "package.json"),
      JSON.stringify({ name: `@nt/${slug}`, scripts }),
    );
    if (configSource !== undefined) {
      writeFileSync(join(repoRoot, dir, "vitest.config.ts"), configSource);
    }
    return { dir, name: `@nt/${slug}`, scripts };
  }

  it("passes a package with a coverage script and a config referencing the shared baseline", () => {
    const pkg = writePackage("clean", { coverage: "vitest run --coverage" }, BASELINED_CONFIG);

    const report = checkCoverageCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([]);
    expect(report.ok).toEqual(["clean"]);
  });

  it("flags omission: a package with no coverage script at all", () => {
    const pkg = writePackage("nogate", { build: "tsup" });

    const report = checkCoverageCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([
      {
        pkg: "nogate",
        kind: "missing-script",
        detail: 'packages/nogate/package.json defines no "coverage" script',
      },
    ]);
  });

  it("flags a coverage script with no vitest.config.ts to back it", () => {
    const pkg = writePackage("noconfig", { coverage: "vitest run --coverage" });

    const report = checkCoverageCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([
      {
        pkg: "noconfig",
        kind: "missing-config",
        detail: 'packages/noconfig has a "coverage" script but no vitest.config.ts',
      },
    ]);
  });

  it("flags opt-out: a coverage script whose config never references the shared baseline", () => {
    const pkg = writePackage("optout", { coverage: "vitest run --coverage" }, HARDCODED_CONFIG);

    const report = checkCoverageCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([
      {
        pkg: "optout",
        kind: "not-baselined",
        detail:
          "packages/optout/vitest.config.ts does not import packageCoverage from the shared vitest.coverage.shared baseline",
      },
    ]);
  });

  it("accepts a documented ratchet that still spreads the shared baseline", () => {
    const pkg = writePackage("ratcheted", { coverage: "vitest run --coverage" }, RATCHETED_CONFIG);

    const report = checkCoverageCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([]);
    expect(report.ok).toEqual(["ratcheted"]);
  });

  it("exempts a listed package even with no coverage script, and never reports it as a gap", () => {
    const pkg = writePackage("exempted", { build: "tsup" });

    const report = checkCoverageCompleteness(
      repoRoot,
      [pkg],
      [{ pkg: "exempted", reason: "no src/" }],
    );

    expect(report.gaps).toEqual([]);
    expect(report.ok).toEqual([]);
    expect(report.exempt).toEqual([{ pkg: "exempted", reason: "no src/" }]);
  });

  it("reports one gap per offending package without short-circuiting the sweep", () => {
    const a = writePackage("a", { build: "tsup" });
    const b = writePackage("b", { coverage: "vitest run --coverage" }, HARDCODED_CONFIG);
    const clean = writePackage("clean", { coverage: "vitest run --coverage" }, BASELINED_CONFIG);

    const report = checkCoverageCompleteness(repoRoot, [a, b, clean], []);

    expect(report.gaps.map((g) => g.pkg)).toEqual(["a", "b"]);
    expect(report.ok).toEqual(["clean"]);
  });

  it("defaults to COVERAGE_EXEMPTIONS, which names benchmarks and security-tests with a written reason", () => {
    expect(COVERAGE_EXEMPTIONS.map((e) => e.pkg)).toEqual(["benchmarks", "security-tests"]);
    for (const exemption of COVERAGE_EXEMPTIONS) {
      expect(exemption.reason.length).toBeGreaterThan(20);
    }
  });
});
