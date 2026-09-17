// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settleMarkers, settleScopeFiles } from "../settle-since-markers.js";
import { gitBlobHash12 } from "../translation-check-discovery.js";

describe("settle-since-markers", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "settle-since-markers-test-"));
    mkdirSync(join(root, "documentation"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("settleScopeFiles", () => {
    it("includes documentation pages and mirrors, the root README and its mirrors, and each package's own README", () => {
      writeFileSync(join(root, "documentation", "guide.md"), "");
      mkdirSync(join(root, "documentation", "es"));
      writeFileSync(join(root, "documentation", "es", "guia.md"), "");
      writeFileSync(join(root, "README.md"), "# Hi\n");
      writeFileSync(
        join(root, "MIRROR.md"),
        "<!-- source: README.md blob 000000000000 | translated: 2026-01-01 | reviewed: - -->\nHola\n",
      );
      mkdirSync(join(root, "packages", "foo"), { recursive: true });
      writeFileSync(join(root, "packages", "foo", "README.md"), "# foo\n");

      const found = settleScopeFiles(root).sort();
      expect(found).toEqual(
        [
          join(root, "documentation", "es", "guia.md"),
          join(root, "documentation", "guide.md"),
          join(root, "README.md"),
          join(root, "MIRROR.md"),
          join(root, "packages", "foo", "README.md"),
        ].sort(),
      );
    });

    it("excludes documentation-scoped internal docs .publishignore itself strips, and never touches a root-level non-mirror file", () => {
      writeFileSync(join(root, "documentation", "guide.md"), "");
      writeFileSync(join(root, "documentation", "release-plan.md"), "");
      writeFileSync(join(root, "documentation", "security-testing.md"), "");
      writeFileSync(join(root, "documentation", "event-bus-architecture-evolution.md"), "");
      writeFileSync(join(root, "documentation", "trace-id-propagation-approach.md"), "");
      writeFileSync(join(root, "NOTES.md"), "");

      const found = settleScopeFiles(root);
      expect(found).toEqual([join(root, "documentation", "guide.md")]);
    });

    it("never recurses into a package's own subdirectories — a test fixture two levels down is not README.md", () => {
      mkdirSync(join(root, "packages", "foo", "__tests__"), { recursive: true });
      writeFileSync(join(root, "packages", "foo", "README.md"), "# foo\n");
      writeFileSync(
        join(root, "packages", "foo", "__tests__", "fixture.md"),
        "*(since 0.1.3, unreleased)*\n",
      );

      const found = settleScopeFiles(root);
      expect(found).toEqual([join(root, "packages", "foo", "README.md")]);
    });
  });

  describe("settleMarkers", () => {
    it("settles only the exact version's markers, restamps a mirror whose source changed, and leaves a later version's marker alone", () => {
      mkdirSync(join(root, "documentation", "es"), { recursive: true });
      const guide = join(root, "documentation", "guide.md");
      writeFileSync(
        guide,
        "Behaviour A. *(since 0.1.3, unreleased)*\nBehaviour B. *(since 0.2.0, unreleased)*\n",
      );
      const mirror = join(root, "documentation", "es", "guia.md");
      writeFileSync(
        mirror,
        "<!-- source: documentation/guide.md blob 000000000000 | translated: 2026-01-01 | reviewed: - -->\n" +
          "Comportamiento A. *(since 0.1.3, unreleased)*\n",
      );

      const result = settleMarkers(root, "0.1.3");

      expect(result.changed).toEqual(
        [join("documentation", "es", "guia.md"), join("documentation", "guide.md")].sort(),
      );
      expect(result.mirrorsRestamped).toEqual([join("documentation", "es", "guia.md")]);

      const guideAfter = readFileSync(guide, "utf-8");
      expect(guideAfter).toContain("Behaviour A. *(since 0.1.3)*");
      expect(guideAfter).toContain("Behaviour B. *(since 0.2.0, unreleased)*"); // survives

      const mirrorAfter = readFileSync(mirror, "utf-8");
      expect(mirrorAfter).toContain("Comportamiento A. *(since 0.1.3)*");
      expect(mirrorAfter.split("\n")[0]).toBe(
        `<!-- source: documentation/guide.md blob ${gitBlobHash12(guideAfter)} | translated: 2026-01-01 | reviewed: - -->`,
      );
    });

    it("never touches a source or test fixture carrying a marker-shaped string outside scope", () => {
      mkdirSync(join(root, "packages", "foo", "__tests__"), { recursive: true });
      writeFileSync(join(root, "packages", "foo", "README.md"), "# foo\n");
      const fixture = join(root, "packages", "foo", "__tests__", "fixture.md");
      const fixtureContent = "*(since 0.1.3, unreleased)*\n";
      writeFileSync(fixture, fixtureContent);

      settleMarkers(root, "0.1.3");

      expect(readFileSync(fixture, "utf-8")).toBe(fixtureContent);
    });

    it("restamps the mirror of a page the regenerate step alone changed, even though that page carries no marker of its own", () => {
      // The morning-of-2026-09-17 regression, ported: a settle run rewrites markers, then a
      // banner/snippet regeneration step can mutate an English page that never carried a marker
      // at all — that page's translated mirror must still be restamped, not only mirrors of the
      // marker-rewritten sources.
      mkdirSync(join(root, "documentation", "es"), { recursive: true });
      writeFileSync(
        join(root, "documentation", "guide.md"),
        "Behaviour A. *(since 0.1.3, unreleased)*\n",
      );
      const other = join(root, "documentation", "other.md");
      writeFileSync(other, "No marker here.\n");
      const originalHash = gitBlobHash12(readFileSync(other, "utf-8"));
      const otherMirror = join(root, "documentation", "es", "otro.md");
      writeFileSync(
        otherMirror,
        `<!-- source: documentation/other.md blob ${originalHash} | translated: 2026-01-01 | reviewed: - -->\n` +
          "Sin marcador.\n",
      );

      const result = settleMarkers(root, "0.1.3", {
        regenerate: (repoRoot) => {
          const target = join(repoRoot, "documentation", "other.md");
          writeFileSync(target, `${readFileSync(target, "utf-8")}Regenerated line.\n`);
        },
      });

      const newHash = gitBlobHash12(readFileSync(other, "utf-8"));
      expect(newHash).not.toBe(originalHash);
      expect(result.mirrorsRestamped).toContain(join("documentation", "es", "otro.md"));
      expect(readFileSync(otherMirror, "utf-8").split("\n")[0]).toBe(
        `<!-- source: documentation/other.md blob ${newHash} | translated: 2026-01-01 | reviewed: - -->`,
      );
    });

    it("never calls regenerate when nothing settled — a no-op run touches nothing", () => {
      writeFileSync(
        join(root, "documentation", "guide.md"),
        "Nothing shipped yet. *(since 0.2.0, unreleased)*\n",
      );
      let regenerateCalls = 0;

      settleMarkers(root, "0.1.3", { regenerate: () => (regenerateCalls += 1) });

      expect(regenerateCalls).toBe(0);
    });

    it("settles nothing and reports empty lists when no marker for the version is anywhere in scope", () => {
      writeFileSync(
        join(root, "documentation", "guide.md"),
        "Nothing shipped yet. *(since 0.2.0, unreleased)*\n",
      );

      const result = settleMarkers(root, "0.1.3");

      expect(result.changed).toEqual([]);
      expect(result.mirrorsRestamped).toEqual([]);
    });
  });
});
