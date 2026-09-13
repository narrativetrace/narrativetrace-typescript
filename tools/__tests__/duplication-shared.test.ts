// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aggregate,
  buildClusters,
  buildTreeResult,
  countCoveredLines,
  type DuplicationCluster,
  type DuplicationScanResult,
  mainSourceDirs,
  type RawJscpdReport,
  readScanJson,
  sumDuplicatedLines,
  summaryLine,
  testSourceDirs,
  toRelativePath,
  writeScanJson,
} from "../duplication-shared.js";

describe("toRelativePath", () => {
  it("strips the repo root and normalises separators to /", () => {
    const repoRoot = sep === "\\" ? "C:\\repo" : "/repo";
    const abs = join(repoRoot, "packages", "core", "src", "trace-namer.ts");

    expect(toRelativePath(repoRoot, abs)).toBe("packages/core/src/trace-namer.ts");
  });
});

function rawDuplicate(
  firstFile: string,
  firstStart: number,
  firstEnd: number,
  secondFile: string,
  secondStart: number,
  secondEnd: number,
  tokens = 100,
): RawJscpdReport["duplicates"][number] {
  return {
    firstFile: { name: firstFile, start: firstStart, end: firstEnd },
    secondFile: { name: secondFile, start: secondStart, end: secondEnd },
    tokens,
    lines: firstEnd - firstStart + 1,
  };
}

describe("buildClusters", () => {
  it("normalises paths relative to the repo root and sorts largest-first by tokens", () => {
    const raw: RawJscpdReport = {
      duplicates: [
        rawDuplicate("/repo/a.ts", 1, 5, "/repo/b.ts", 1, 5, 50),
        rawDuplicate("/repo/c.ts", 1, 5, "/repo/d.ts", 1, 5, 200),
      ],
      statistics: { total: { lines: 20 } },
    };

    const clusters = buildClusters(raw, "/repo");

    expect(clusters.map((c) => c.tokens)).toEqual([200, 50]);
    expect(clusters[1]?.occurrences).toEqual([
      { file: "a.ts", startLine: 1, endLine: 5 },
      { file: "b.ts", startLine: 1, endLine: 5 },
    ]);
  });

  it("always produces exactly two occurrences — jscpd reports duplication as pairs, never N-way", () => {
    const raw: RawJscpdReport = {
      duplicates: [rawDuplicate("/repo/a.ts", 1, 5, "/repo/b.ts", 1, 5)],
      statistics: { total: { lines: 10 } },
    };

    expect(buildClusters(raw, "/repo")[0]?.occurrences).toHaveLength(2);
  });
});

describe("countCoveredLines", () => {
  it("returns 0 for no spans", () => {
    expect(countCoveredLines([])).toBe(0);
  });

  it("sums disjoint spans", () => {
    expect(
      countCoveredLines([
        { start: 1, end: 6 },
        { start: 10, end: 15 },
      ]),
    ).toBe(10);
  });

  it("unions overlapping spans instead of summing them", () => {
    expect(
      countCoveredLines([
        { start: 1, end: 10 },
        { start: 5, end: 15 },
      ]),
    ).toBe(14); // [1,15) — not 19, which a naive sum would give
  });

  it("merges adjacent (touching) spans into one run", () => {
    expect(
      countCoveredLines([
        { start: 1, end: 5 },
        { start: 5, end: 10 },
      ]),
    ).toBe(9);
  });

  it("handles a span fully contained inside another", () => {
    expect(
      countCoveredLines([
        { start: 1, end: 20 },
        { start: 5, end: 10 },
      ]),
    ).toBe(19);
  });
});

describe("sumDuplicatedLines", () => {
  function cluster(
    fileA: string,
    startA: number,
    endA: number,
    fileB: string,
    startB: number,
    endB: number,
  ): DuplicationCluster {
    return {
      tokens: 100,
      lines: endA - startA + 1,
      occurrences: [
        { file: fileA, startLine: startA, endLine: endA },
        { file: fileB, startLine: startB, endLine: endB },
      ],
    };
  }

  it("unions per file — the same line number in two different files is not the same position", () => {
    const clusters = [cluster("a.ts", 1, 5, "b.ts", 1, 5)];

    // 5 lines in a.ts + 5 lines in b.ts = 10, not deduplicated across files by number.
    expect(sumDuplicatedLines(clusters)).toBe(10);
  });

  it("dedupes a shape copied three times across pairwise clusters (A↔B, A↔C) instead of triple-counting A's lines", () => {
    const clusters = [cluster("a.ts", 1, 5, "b.ts", 1, 5), cluster("a.ts", 1, 5, "c.ts", 1, 5)];

    // a.ts's 5 lines are covered by BOTH clusters but must count once; b.ts and c.ts each add 5.
    expect(sumDuplicatedLines(clusters)).toBe(15);
  });

  it("returns 0 for no clusters", () => {
    expect(sumDuplicatedLines([])).toBe(0);
  });
});

describe("aggregate", () => {
  it("computes a percent bounded by the union, rounded to one decimal", () => {
    const clusters = [
      {
        tokens: 100,
        lines: 3,
        occurrences: [
          { file: "a.ts", startLine: 1, endLine: 3 },
          { file: "b.ts", startLine: 1, endLine: 3 },
        ],
      } satisfies DuplicationCluster,
    ];

    const result = aggregate(20, clusters);

    expect(result).toEqual({ linesTotal: 20, linesDuplicated: 6, percent: 30, clusters });
  });

  it("never divides by zero — an empty tree reports 0%, not NaN", () => {
    expect(aggregate(0, [])).toEqual({
      linesTotal: 0,
      linesDuplicated: 0,
      percent: 0,
      clusters: [],
    });
  });
});

describe("buildTreeResult", () => {
  it("combines cluster normalisation and aggregation for one raw jscpd report", () => {
    const raw: RawJscpdReport = {
      duplicates: [rawDuplicate("/repo/a.ts", 1, 5, "/repo/b.ts", 1, 5, 60)],
      statistics: { total: { lines: 10 } },
    };

    const result = buildTreeResult(raw, "/repo");

    expect(result.linesTotal).toBe(10);
    expect(result.linesDuplicated).toBe(10);
    expect(result.percent).toBe(100);
    expect(result.clusters).toHaveLength(1);
  });
});

describe("writeScanJson / readScanJson", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-duplication-json-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a scan result, creating parent directories as needed", () => {
    const scan: DuplicationScanResult = {
      tool: "jscpd",
      language: "typescript",
      minTokens: 60,
      main: { linesTotal: 100, linesDuplicated: 10, percent: 10, clusters: [] },
      test: { linesTotal: 200, linesDuplicated: 40, percent: 20, clusters: [] },
    };
    const filePath = join(dir, "nested", "duplication.json");

    writeScanJson(scan, filePath);

    expect(readScanJson(filePath)).toEqual(scan);
  });
});

describe("summaryLine", () => {
  it("names the largest cluster and marks the test tree as reported only", () => {
    const scan: DuplicationScanResult = {
      tool: "jscpd",
      language: "typescript",
      minTokens: 60,
      main: {
        linesTotal: 100,
        linesDuplicated: 10,
        percent: 10,
        clusters: [
          {
            tokens: 200,
            lines: 5,
            occurrences: [
              { file: "a.ts", startLine: 1, endLine: 5 },
              { file: "b.ts", startLine: 10, endLine: 14 },
            ],
          },
        ],
      },
      test: { linesTotal: 50, linesDuplicated: 0, percent: 0, clusters: [] },
    };

    const line = summaryLine(scan);

    expect(line).toContain("main 10.0% of lines in 1 clusters");
    expect(line).toContain("largest 200 tokens a.ts:1 ↔ b.ts:10");
    expect(line).toContain("test 0.0% in 0 clusters (reported, not gated)");
  });

  it("says 'no clusters' when a tree has none", () => {
    const scan: DuplicationScanResult = {
      tool: "jscpd",
      language: "typescript",
      minTokens: 60,
      main: { linesTotal: 100, linesDuplicated: 0, percent: 0, clusters: [] },
      test: { linesTotal: 50, linesDuplicated: 0, percent: 0, clusters: [] },
    };

    expect(summaryLine(scan)).toContain("(no clusters)");
  });
});

describe("mainSourceDirs / testSourceDirs", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "nt-duplication-dirs-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function mkpkg(name: string, subdirs: readonly string[]): void {
    for (const sub of subdirs)
      mkdirSync(join(repoRoot, "packages", name, sub), { recursive: true });
  }

  it("finds every package's src directory that exists, skipping packages without one", () => {
    mkpkg("core", ["src"]);
    mkpkg("no-src", ["__tests__"]);

    expect(mainSourceDirs(repoRoot)).toEqual([join(repoRoot, "packages", "core", "src")]);
  });

  it("finds every package's __tests__ directory plus examples/ and tools/__tests__ when present", () => {
    mkpkg("core", ["src", "__tests__"]);
    mkpkg("no-tests", ["src"]);
    mkdirSync(join(repoRoot, "examples"), { recursive: true });
    mkdirSync(join(repoRoot, "tools", "__tests__"), { recursive: true });
    writeFileSync(join(repoRoot, "packages", "core", "__tests__", "x.test.ts"), "");

    expect(testSourceDirs(repoRoot)).toEqual([
      join(repoRoot, "packages", "core", "__tests__"),
      join(repoRoot, "examples"),
      join(repoRoot, "tools", "__tests__"),
    ]);
  });

  it("returns an empty list rather than throwing when packages/ does not exist", () => {
    expect(mainSourceDirs(repoRoot)).toEqual([]);
    expect(testSourceDirs(repoRoot)).toEqual([]);
  });
});
