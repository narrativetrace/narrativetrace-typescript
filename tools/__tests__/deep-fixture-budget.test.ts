// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lint } from "../deep-fixture-budget.js";

function writeTest(root: string, relPath: string, body: string): void {
  const full = join(root, relPath);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, body);
}

describe("deep-fixture-budget", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "deep-fixture-budget-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("lint", () => {
    it("flags a named-builder fixture call with no third argument", () => {
      writeTest(
        root,
        "packages/core/__tests__/a.test.ts",
        [
          'import { test, expect } from "vitest";',
          "function chain(n) { return n; }",
          'test("does not stack-overflow on a very deep chain", () => {',
          "  expect(() => chain(50_000)).not.toThrow();",
          "});",
        ].join("\n"),
      );

      const { violations } = lint(root, []);

      expect(violations).toEqual([
        {
          file: "packages/core/__tests__/a.test.ts",
          line: 3,
          name: "does not stack-overflow on a very deep chain",
        },
      ]);
    });

    it("does not flag the same test once it declares a third (timeout) argument", () => {
      writeTest(
        root,
        "packages/core/__tests__/a.test.ts",
        [
          'import { test, expect } from "vitest";',
          "function chain(n) { return n; }",
          'test("does not stack-overflow on a very deep chain", () => {',
          "  expect(() => chain(50_000)).not.toThrow();",
          "}, 2_000);",
        ].join("\n"),
      );

      expect(lint(root, []).violations).toEqual([]);
    });

    it("flags a raw accumulating loop bounded at 10,000 that reassigns a variable to a call referencing itself", () => {
      writeTest(
        root,
        "packages/core/__tests__/b.test.ts",
        [
          'import { test } from "vitest";',
          "function node(id, kids) { return { id, kids }; }",
          'test("builds a long chain", () => {',
          '  let root = node("leaf");',
          "  for (let i = 0; i < 10_000; i++) root = node(String(i), [root]);",
          "});",
        ].join("\n"),
      );

      const { violations } = lint(root, []);

      expect(violations).toEqual([
        { file: "packages/core/__tests__/b.test.ts", line: 3, name: "builds a long chain" },
      ]);
    });

    it("does not flag a loop merely calling a method 50,000 times with no self-referential accumulation", () => {
      writeTest(
        root,
        "packages/core/__tests__/c.test.ts",
        [
          'import { test } from "vitest";',
          'test("cheap repeated calls", () => {',
          "  const walk = { enter: () => {} };",
          "  for (let i = 0; i < 10_000; i++) walk.enter({});",
          "});",
        ].join("\n"),
      );

      expect(lint(root, []).violations).toEqual([]);
    });

    it("does not flag an unrelated call coincidentally passing 10,000 (not a recognized fixture builder)", () => {
      writeTest(
        root,
        "packages/core/__tests__/d.test.ts",
        [
          'import { test } from "vitest";',
          'test("a long string does not blow the path limit", () => {',
          '  const name = "A".repeat(10_000);',
          "});",
        ].join("\n"),
      );

      expect(lint(root, []).violations).toEqual([]);
    });

    it("never scans a .stress.test.ts file — it budgets itself on a separate turbo task", () => {
      writeTest(
        root,
        "packages/core/__tests__/stress/e.stress.test.ts",
        [
          'import { test } from "vitest";',
          "function chain(n) { return n; }",
          'test("stress fixture", () => {',
          "  chain(10_000);",
          "});",
        ].join("\n"),
      );

      expect(lint(root, []).violations).toEqual([]);
    });

    it("excuses exactly the (file, testName) pair named in the allowlist, and no other test in that file", () => {
      writeTest(
        root,
        "packages/core/__tests__/f.test.ts",
        [
          'import { test } from "vitest";',
          "function chain(n) { return n; }",
          'test("excused fixture", () => {',
          "  chain(50_000);",
          "});",
          'test("unrelated unbudgeted fixture", () => {',
          "  chain(10_000);",
          "});",
        ].join("\n"),
      );

      const { violations } = lint(root, [
        {
          file: "packages/core/__tests__/f.test.ts",
          testName: "excused fixture",
          reason: "test fixture",
        },
      ]);

      expect(violations).toEqual([
        {
          file: "packages/core/__tests__/f.test.ts",
          line: 6,
          name: "unrelated unbudgeted fixture",
        },
      ]);
    });

    it("flags a builder call whose fixture size is a same-file constant, not an inline literal", () => {
      writeTest(
        root,
        "packages/core/__tests__/h.test.ts",
        [
          'import { test } from "vitest";',
          "const DEPTH = 50_000;",
          "function deepChainEvents(depth) { return depth; }",
          'test("prunes a chain deeper than the call stack without crashing", () => {',
          "  const events = deepChainEvents(DEPTH, true);",
          "});",
        ].join("\n"),
      );

      const { violations } = lint(root, []);

      expect(violations).toEqual([
        {
          file: "packages/core/__tests__/h.test.ts",
          line: 4,
          name: "prunes a chain deeper than the call stack without crashing",
        },
      ]);
    });

    it("does not flag a builder call whose identifier argument resolves to an unrelated constant", () => {
      writeTest(
        root,
        "packages/core/__tests__/i.test.ts",
        [
          'import { test } from "vitest";',
          "const SMALL = 5;",
          "function chain(depth) { return depth; }",
          'test("a small chain is unaffected", () => {',
          "  chain(SMALL);",
          "});",
        ].join("\n"),
      );

      expect(lint(root, []).violations).toEqual([]);
    });

    it("flags an allowlist entry whose test no longer produces a hit as stale", () => {
      writeTest(
        root,
        "packages/core/__tests__/g.test.ts",
        ['import { test } from "vitest";', 'test("already fixed", () => {}, 1_000);'].join("\n"),
      );

      const { staleAllowlistEntries } = lint(root, [
        { file: "packages/core/__tests__/g.test.ts", testName: "already fixed", reason: "stale" },
      ]);

      expect(staleAllowlistEntries).toEqual([
        { file: "packages/core/__tests__/g.test.ts", testName: "already fixed", reason: "stale" },
      ]);
    });
  });
});
