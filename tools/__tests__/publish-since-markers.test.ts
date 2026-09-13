// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findStaleSinceMarkers,
  markdownAndLlmsFiles,
  rewriteSinceMarkers,
} from "../publish-since-markers.js";

describe("publish-since-markers", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "publish-since-markers-test-"));
    mkdirSync(join(root, "documentation"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("markdownAndLlmsFiles", () => {
    it("finds every .md and llms.txt file, recursively, and nothing else", () => {
      writeFileSync(join(root, "documentation", "guide.md"), "");
      writeFileSync(join(root, "documentation", "llms.txt"), "");
      writeFileSync(join(root, "documentation", "notes.txt"), "");
      mkdirSync(join(root, "documentation", "es"));
      writeFileSync(join(root, "documentation", "es", "guia.md"), "");

      const found = markdownAndLlmsFiles(root).sort();
      expect(found).toEqual(
        [
          join(root, "documentation", "es", "guia.md"),
          join(root, "documentation", "guide.md"),
          join(root, "documentation", "llms.txt"),
        ].sort(),
      );
    });
  });

  describe("rewriteSinceMarkers", () => {
    it("drops ', unreleased' from a marker citing exactly this version", () => {
      const file = join(root, "documentation", "guide.md");
      writeFileSync(file, "New in this release. *(since 0.1.3, unreleased)*\n");

      const changed = rewriteSinceMarkers(root, "0.1.3");

      expect(changed).toEqual([join("documentation", "guide.md")]);
      expect(readFileSync(file, "utf-8")).toBe("New in this release. *(since 0.1.3)*\n");
    });

    it("leaves a marker citing a different version untouched", () => {
      const file = join(root, "documentation", "guide.md");
      const original = "Future work. *(since 0.1.4, unreleased)*\n";
      writeFileSync(file, original);

      const changed = rewriteSinceMarkers(root, "0.1.3");

      expect(changed).toEqual([]);
      expect(readFileSync(file, "utf-8")).toBe(original);
    });

    it("rewrites a marker wrapped right after 'since' — the hard-wrap gap a line-based sed misses", () => {
      const file = join(root, "documentation", "guide.md");
      writeFileSync(file, "*(since\n0.1.3, unreleased)*\n");

      rewriteSinceMarkers(root, "0.1.3");

      expect(readFileSync(file, "utf-8")).toBe("*(since 0.1.3)*\n");
    });

    it("rewrites a marker wrapped right after the version's comma", () => {
      const file = join(root, "documentation", "guide.md");
      writeFileSync(file, "*(since 0.1.3,\nunreleased)*\n");

      rewriteSinceMarkers(root, "0.1.3");

      expect(readFileSync(file, "utf-8")).toBe("*(since 0.1.3)*\n");
    });

    it("rewrites every matching marker across every file, reporting each changed path once", () => {
      const a = join(root, "documentation", "a.md");
      const b = join(root, "documentation", "b.md");
      writeFileSync(a, "*(since 0.1.3, unreleased)* and *(since 0.1.3, unreleased)*\n");
      writeFileSync(b, "*(since 0.1.3, unreleased)*\n");

      const changed = rewriteSinceMarkers(root, "0.1.3").sort();

      expect(changed).toEqual(
        [join("documentation", "a.md"), join("documentation", "b.md")].sort(),
      );
      expect(readFileSync(a, "utf-8")).toBe("*(since 0.1.3)* and *(since 0.1.3)*\n");
    });
  });

  describe("findStaleSinceMarkers", () => {
    it("reports a marker citing exactly the snapshot version", () => {
      writeFileSync(
        join(root, "documentation", "guide.md"),
        "line one\n*(since 0.1.3, unreleased)*\n",
      );

      expect(findStaleSinceMarkers(root, "0.1.3")).toEqual([
        `${join("documentation", "guide.md")}:2: since 0.1.3`,
      ]);
    });

    it("reports a marker citing an EARLIER version too — never rewritten because it names a different version", () => {
      writeFileSync(join(root, "documentation", "guide.md"), "*(since 0.1.2, unreleased)*\n");

      expect(findStaleSinceMarkers(root, "0.1.3")).toEqual([
        `${join("documentation", "guide.md")}:1: since 0.1.2`,
      ]);
    });

    it("does not report a marker citing a later, not-yet-cut version", () => {
      writeFileSync(join(root, "documentation", "guide.md"), "*(since 0.2.0, unreleased)*\n");

      expect(findStaleSinceMarkers(root, "0.1.3")).toEqual([]);
    });

    it("finds a marker wrapped across a hard-wrap that a line-based grep would miss", () => {
      writeFileSync(join(root, "documentation", "guide.md"), "*(since 0.1.3,\nunreleased)*\n");

      expect(findStaleSinceMarkers(root, "0.1.3")).toEqual([
        `${join("documentation", "guide.md")}:1: since 0.1.3`,
      ]);
    });

    it("reports nothing once the rewrite has run", () => {
      const file = join(root, "documentation", "guide.md");
      writeFileSync(file, "*(since 0.1.3, unreleased)*\n");
      rewriteSinceMarkers(root, "0.1.3");

      expect(findStaleSinceMarkers(root, "0.1.3")).toEqual([]);
    });
  });
});
