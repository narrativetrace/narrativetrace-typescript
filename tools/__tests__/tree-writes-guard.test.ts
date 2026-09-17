// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { newWorkingTreeEntries, reportLines } from "../tree-writes-guard.mjs";

const CLEAN: string[] = [];

describe("newWorkingTreeEntries", () => {
  test("sees nothing when the command left the tree as it found it", () => {
    expect(newWorkingTreeEntries(CLEAN, CLEAN)).toStrictEqual([]);
  });

  test("reports a file the command created", () => {
    expect(newWorkingTreeEntries(CLEAN, ["?? documentation/page.md"])).toStrictEqual([
      "?? documentation/page.md",
    ]);
  });

  test("reports a tracked file the command rewrote", () => {
    expect(newWorkingTreeEntries(CLEAN, [" M documentation/guide.md"])).toStrictEqual([
      " M documentation/guide.md",
    ]);
  });

  test("ignores edits that were already there when the command started", () => {
    // The gate runs on whatever tree the developer has; only what the command itself
    // added is its doing.
    expect(
      newWorkingTreeEntries([" M documentation/guide.md"], [" M documentation/guide.md"]),
    ).toStrictEqual([]);
  });

  test("reports a file whose state changed under a command that did not create it", () => {
    expect(
      newWorkingTreeEntries(["?? documentation/guide.md"], [" M documentation/guide.md"]),
    ).toStrictEqual([" M documentation/guide.md"]);
  });

  test("reports a rename, whose porcelain line names both paths", () => {
    expect(newWorkingTreeEntries(CLEAN, ["R  a.md -> b.md"])).toStrictEqual(["R  a.md -> b.md"]);
  });
});

describe("reportLines", () => {
  test("names the command and every path it wrote", () => {
    const lines = reportLines("pnpm run test:root", [" M documentation/guide.md", "?? out.txt"]);

    expect(lines.join("\n")).toContain("pnpm run test:root");
    expect(lines.join("\n")).toContain("documentation/guide.md");
    expect(lines.join("\n")).toContain("out.txt");
  });

  test("says what the failure means, so the fix is not 'commit the diff'", () => {
    expect(reportLines("x", ["?? a"]).join("\n")).toMatch(/read-only|without writing/i);
  });
});
