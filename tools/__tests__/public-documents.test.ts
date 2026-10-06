// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markdownAndLlmsFiles, publicDocuments } from "../public-documents.js";

describe("public-documents", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "public-documents-test-"));
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

  describe("publicDocuments", () => {
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

      const found = publicDocuments(root).sort();
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

      const found = publicDocuments(root);
      expect(found).toEqual([join(root, "documentation", "guide.md")]);
    });

    it("never recurses into a package's own subdirectories — a test fixture two levels down is not README.md", () => {
      mkdirSync(join(root, "packages", "foo", "__tests__"), { recursive: true });
      writeFileSync(join(root, "packages", "foo", "README.md"), "# foo\n");
      writeFileSync(
        join(root, "packages", "foo", "__tests__", "fixture.md"),
        "*(since 0.1.3, unreleased)*\n",
      );

      const found = publicDocuments(root);
      expect(found).toEqual([join(root, "packages", "foo", "README.md")]);
    });

    it("is empty for a repository with no documentation/, README or packages at all", () => {
      rmSync(join(root, "documentation"), { recursive: true, force: true });

      expect(publicDocuments(root)).toEqual([]);
    });
  });
});
