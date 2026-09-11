// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspacePackage } from "../verify-all-packages.js";
import { checkMutationCompleteness, MUTATION_EXEMPTIONS } from "../verify-mutation-completeness.js";

describe("checkMutationCompleteness", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "nt-mutation-completeness-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function writePackage(
    slug: string,
    scripts: Record<string, string>,
    withStrykerConfig = false,
  ): WorkspacePackage {
    const dir = join("packages", slug);
    mkdirSync(join(repoRoot, dir), { recursive: true });
    writeFileSync(
      join(repoRoot, dir, "package.json"),
      JSON.stringify({ name: `@nt/${slug}`, scripts }),
    );
    if (withStrykerConfig) {
      writeFileSync(join(repoRoot, dir, "stryker.config.json"), "{}");
    }
    return { dir, name: `@nt/${slug}`, scripts };
  }

  it("passes a package with a mutate script and its own stryker.config.json", () => {
    const pkg = writePackage("clean", { mutate: "stryker run" }, true);

    const report = checkMutationCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([]);
    expect(report.ok).toEqual(["clean"]);
  });

  it("flags omission: a package with no mutate script at all", () => {
    const pkg = writePackage("nogate", { build: "tsup" });

    const report = checkMutationCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([
      {
        pkg: "nogate",
        kind: "missing-script",
        detail: 'packages/nogate/package.json defines no "mutate" script',
      },
    ]);
  });

  it("flags a mutate script with no stryker.config.json to back it", () => {
    const pkg = writePackage("noconfig", { mutate: "stryker run" });

    const report = checkMutationCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([
      {
        pkg: "noconfig",
        kind: "missing-config",
        detail: 'packages/noconfig has a "mutate" script but no stryker.config.json',
      },
    ]);
  });

  it("exempts a listed package even with no mutate script, and never reports it as a gap", () => {
    const pkg = writePackage("exempted", { build: "tsup" });

    const report = checkMutationCompleteness(
      repoRoot,
      [pkg],
      [{ pkg: "exempted", reason: "no src/ to speak of, nothing a mutant could touch" }],
    );

    expect(report.gaps).toEqual([]);
    expect(report.ok).toEqual([]);
    expect(report.exempt).toEqual([
      { pkg: "exempted", reason: "no src/ to speak of, nothing a mutant could touch" },
    ]);
  });

  it("RED OBSERVATION (a): flags a package left unclassified — neither wired nor exempt", () => {
    const pkg = writePackage("orphan", { build: "tsup" });

    const report = checkMutationCompleteness(repoRoot, [pkg], []);

    expect(report.gaps).toEqual([
      {
        pkg: "orphan",
        kind: "missing-script",
        detail: 'packages/orphan/package.json defines no "mutate" script',
      },
    ]);
  });

  it("RED OBSERVATION (b): flags a package classified both wired AND exempt", () => {
    const pkg = writePackage("stale-exemption", { mutate: "stryker run" }, true);

    const report = checkMutationCompleteness(
      repoRoot,
      [pkg],
      [{ pkg: "stale-exemption", reason: "used to have no logic worth mutating" }],
    );

    expect(report.gaps).toEqual([
      {
        pkg: "stale-exemption",
        kind: "double-classified",
        detail:
          "packages/stale-exemption is both wired for mutation testing (mutate script + " +
          'stryker.config.json) and listed in MUTATION_EXEMPTIONS ("used to have no logic worth ' +
          'mutating") — remove one',
      },
    ]);
  });

  it("reports one gap per offending package without short-circuiting the sweep", () => {
    const a = writePackage("a", { build: "tsup" });
    const b = writePackage("b", { mutate: "stryker run" }); // missing config
    const clean = writePackage("clean", { mutate: "stryker run" }, true);

    const report = checkMutationCompleteness(repoRoot, [a, b, clean], []);

    expect(report.gaps.map((g) => g.pkg)).toEqual(["a", "b"]);
    expect(report.ok).toEqual(["clean"]);
  });

  it("defaults to MUTATION_EXEMPTIONS, which names benchmarks, security-tests, and standalone with a written reason", () => {
    expect(MUTATION_EXEMPTIONS.map((e) => e.pkg)).toEqual([
      "benchmarks",
      "security-tests",
      "standalone",
    ]);
    for (const exemption of MUTATION_EXEMPTIONS) {
      expect(exemption.reason.length).toBeGreaterThan(20);
    }
  });
});
