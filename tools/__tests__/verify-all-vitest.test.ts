// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  allGreen,
  matchingModule,
  matchingPath,
  readVitestResults,
  summarize,
  type TestFileEntry,
  totalSeconds,
} from "../verify-all-vitest.js";

function entry(overrides: Partial<TestFileEntry> = {}): TestFileEntry {
  return {
    module: "core",
    file: "/workspace/packages/core/__tests__/x.test.ts",
    testsPassed: 1,
    testsFailed: 0,
    testsSkipped: 0,
    timeSeconds: 1,
    ...overrides,
  };
}

describe("summarize / allGreen / totalSeconds", () => {
  test("sums every field across entries, test_classes is the entry count", () => {
    const entries = [
      entry({ testsPassed: 3, testsFailed: 0, testsSkipped: 1, timeSeconds: 0.5 }),
      entry({ testsPassed: 5, testsFailed: 1, testsSkipped: 0, timeSeconds: 1.5 }),
    ];
    expect(summarize(entries)).toEqual({
      tests_passed: 8,
      tests_failed: 1,
      tests_skipped: 1,
      test_classes: 2,
    });
    expect(totalSeconds(entries)).toBe(2);
  });

  test("an empty slice counts as green — nothing ran, nothing failed", () => {
    expect(allGreen([])).toBe(true);
    expect(summarize([])).toEqual({
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      test_classes: 0,
    });
  });

  test("allGreen is false the moment any entry has a failure", () => {
    expect(allGreen([entry({ testsFailed: 0 }), entry({ testsFailed: 1 })])).toBe(false);
  });
});

describe("matchingPath / matchingModule", () => {
  const core = entry({ module: "core", file: "/workspace/packages/core/x.prop.test.ts" });
  const security = entry({
    module: "security-tests",
    file: "/workspace/packages/security-tests/y.test.ts",
  });
  const entries = [core, security];

  test("matchingPath filters by substring, not exact match", () => {
    expect(matchingPath(entries, ".prop.test.ts")).toEqual([core]);
  });

  test("matchingModule filters by exact module name — a prefix match is not enough", () => {
    expect(matchingModule(entries, "security-tests")).toEqual([security]);
    expect(matchingModule(entries, "security")).toEqual([]);
  });
});

describe("readVitestResults", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-verify-all-vitest-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("counts skipped as everything that is neither passed nor failed", () => {
    const path = join(dir, "results.json");
    writeFileSync(
      path,
      JSON.stringify({
        testResults: [
          {
            name: "/workspace/packages/core/x.test.ts",
            startTime: 1000,
            endTime: 1250,
            assertionResults: [
              { status: "passed" },
              { status: "failed" },
              { status: "pending" },
              { status: "todo" },
            ],
          },
        ],
      }),
    );

    const [result] = readVitestResults(path, "core");
    expect(result).toEqual({
      module: "core",
      file: "/workspace/packages/core/x.test.ts",
      testsPassed: 1,
      testsFailed: 1,
      testsSkipped: 2,
      timeSeconds: 0.25,
    });
  });
});
