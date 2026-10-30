// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findHistoryComments,
  findPortFramingComments,
  HISTORY_PATTERN,
  lint,
  PORT_FRAMING_PATTERN,
  packagesSourceFiles,
} from "../comment-hygiene.js";

describe("comment-hygiene", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "comment-hygiene-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("HISTORY_PATTERN", () => {
    it("matches an owner-ruling citation, a ruled-year phrase, a bare audit date, and shipped-release wording", () => {
      expect(HISTORY_PATTERN.test("kept for redaction (owner ruling, 2026-09-11).")).toBe(true);
      expect(HISTORY_PATTERN.test("fixed the gap (ruled 2026-09-12).")).toBe(true);
      expect(HISTORY_PATTERN.test("recomputed here (2026-09-02).")).toBe(true);
      expect(
        HISTORY_PATTERN.test("disable buffering here, by design. *(since 0.1.3, unreleased)*"),
      ).toBe(true);
    });

    it("does not match an ordinary sentence, a version number alone, or a full ISO date outside parens", () => {
      expect(HISTORY_PATTERN.test("Escapes control characters before rendering.")).toBe(false);
      expect(HISTORY_PATTERN.test("Ported from Java's NationalIdShapes.")).toBe(false);
      expect(HISTORY_PATTERN.test("Landed 2026-09-10 across every port.")).toBe(false);
    });
  });

  describe("PORT_FRAMING_PATTERN", () => {
    it.each([
      ["a golden-source phrase", "// the golden source for this table"],
      ["a golden-copy phrase", "// kept in step with the golden copy"],
      ["a reference-implementation phrase", "// see the Reference Implementation"],
      ["the Java repo", "// as defined by the Java repo"],
      ["the Java edition", "// the Java edition does this"],
      ["the JVM edition", "// unlike the JVM edition"],
      ["matching the JVM", "// matching the JVM output"],
      ["Java builder", "// the Java builder pattern"],
      ["a capitalised framing verb (known miss)", "// Mirrors Java's `OutputDirectoryResolver`."],
      ["a lower-case framing verb", "// ported from Java"],
      ["'same as the Java'", "// same as the Java side"],
      ["'as in Java'", "// as in Java"],
      ["a possessive (known miss)", "// are Java's MarkdownTableEscape"],
      ["a backticked Java identifier (known miss)", "// (Java `TraceFileWriter`, B-224)"],
      ["a parenthesised Java class", "// (Java TraceFileWriter)"],
      ["a Java ledger citation (known miss)", "// (Java B-224 / B-227)"],
      ["Java followed by a CamelCase identifier", "// Java TraceFileWriter writes it"],
    ])("matches %s", (_name, line) => {
      expect(PORT_FRAMING_PATTERN.test(line)).toBe(true);
    });

    it.each([
      ["Java alone", "// Interop with Java agents is out of scope."],
      ["JavaScript", "// JavaScript engines differ; the Java Virtual Machine is not involved"],
      ["a family contract", "// The same in every NarrativeTrace runtime."],
    ])("does not match %s", (_name, line) => {
      expect(PORT_FRAMING_PATTERN.test(line)).toBe(false);
    });
  });

  describe("packagesSourceFiles", () => {
    it("finds every .ts file under each package's own src, and never a sibling __tests__ directory", () => {
      mkdirSync(join(root, "packages", "core", "src", "nested"), { recursive: true });
      writeFileSync(join(root, "packages", "core", "src", "a.ts"), "");
      writeFileSync(join(root, "packages", "core", "src", "nested", "b.ts"), "");
      mkdirSync(join(root, "packages", "core", "__tests__"), { recursive: true });
      writeFileSync(join(root, "packages", "core", "__tests__", "a.test.ts"), "");
      mkdirSync(join(root, "packages", "other", "src"), { recursive: true });
      writeFileSync(join(root, "packages", "other", "src", "c.ts"), "");

      const found = packagesSourceFiles(root);

      expect(found).toEqual(
        [
          join(root, "packages", "core", "src", "a.ts"),
          join(root, "packages", "core", "src", "nested", "b.ts"),
          join(root, "packages", "other", "src", "c.ts"),
        ].sort(),
      );
    });

    it("returns an empty list when there is no packages directory at all", () => {
      expect(packagesSourceFiles(root)).toEqual([]);
    });
  });

  describe("findHistoryComments", () => {
    it("reports the repo-relative file, 1-indexed line, and trimmed text of every hit", () => {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      writeFileSync(
        join(root, "packages", "core", "src", "foo.ts"),
        "export const x = 1;\n// fixed the leak (owner ruling, 2026-09-11).\nexport const y = 2;\n",
      );

      expect(findHistoryComments(root)).toEqual([
        {
          file: "packages/core/src/foo.ts",
          line: 2,
          text: "// fixed the leak (owner ruling, 2026-09-11).",
        },
      ]);
    });

    it("finds nothing in a file with no history-shaped comment", () => {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      writeFileSync(
        join(root, "packages", "core", "src", "clean.ts"),
        "// Redacts a value whose shape matches a known secret pattern.\nexport const x = 1;\n",
      );

      expect(findHistoryComments(root)).toEqual([]);
    });
  });

  describe("findPortFramingComments", () => {
    it("reports file, line and trimmed text of every port-framing hit", () => {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      writeFileSync(
        join(root, "packages", "core", "src", "foo.ts"),
        "export const x = 1;\n  // Mirrors Java's Resolver.\n",
      );

      expect(findPortFramingComments(root)).toEqual([
        { file: "packages/core/src/foo.ts", line: 2, text: "// Mirrors Java's Resolver." },
      ]);
    });
  });

  describe("lint", () => {
    it("reports a port-framing hit as a violation, and its allowlist entry as excused", () => {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      writeFileSync(join(root, "packages", "core", "src", "a.ts"), "// (Java B-224)\n");

      expect(lint(root, new Map()).violations).toHaveLength(1);
      const excused = lint(root, new Map([["packages/core/src/a.ts", "reason"]]));
      expect(excused.violations).toEqual([]);
      expect(excused.staleAllowlistEntries).toEqual([]);
    });

    it("reports an unlisted hit as a violation and never flags an allowlisted one", () => {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      mkdirSync(join(root, "packages", "pending", "src"), { recursive: true });
      writeFileSync(
        join(root, "packages", "core", "src", "leftover.ts"),
        "// (owner ruling, 2026-09-11)\n",
      );
      writeFileSync(
        join(root, "packages", "pending", "src", "notyet.ts"),
        "// (owner ruling, 2026-09-11)\n",
      );

      const result = lint(root, new Map([["packages/pending/src/notyet.ts", "wave pending"]]));

      expect(result.violations).toEqual([
        { file: "packages/core/src/leftover.ts", line: 1, text: "// (owner ruling, 2026-09-11)" },
      ]);
      expect(result.staleAllowlistEntries).toEqual([]);
    });

    it("flags an allowlist entry whose file no longer has any hit as stale", () => {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      writeFileSync(join(root, "packages", "core", "src", "clean.ts"), "export const x = 1;\n");

      const result = lint(root, new Map([["packages/core/src/clean.ts", "no longer needed"]]));

      expect(result.violations).toEqual([]);
      expect(result.staleAllowlistEntries).toEqual(["packages/core/src/clean.ts"]);
    });

    it("is clean (no violations, no stale entries) when nothing matches and nothing is allowlisted", () => {
      mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
      writeFileSync(join(root, "packages", "core", "src", "clean.ts"), "export const x = 1;\n");

      const result = lint(root, new Map());

      expect(result.violations).toEqual([]);
      expect(result.staleAllowlistEntries).toEqual([]);
    });
  });
});
