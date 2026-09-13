// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DuplicationBaseline,
  type DuplicationExemption,
  decide,
  isExempt,
  matchesGlob,
  PERCENT_TOLERANCE,
  readBaseline,
  readExemptions,
} from "../duplication-baseline.js";
import type { DuplicationCluster, DuplicationTreeResult } from "../duplication-shared.js";

describe("readBaseline", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-duplication-baseline-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses recorded/main.percent/main.largestCluster, ignoring comments and blank lines", () => {
    const file = join(dir, "baseline.properties");
    writeFileSync(
      file,
      "# a comment\n\nrecorded=2026-09-12\nmain.percent=16.1\nmain.largestCluster=1559\n",
    );

    expect(readBaseline(file)).toEqual({
      recorded: "2026-09-12",
      mainPercent: 16.1,
      mainLargestCluster: 1559,
    });
  });

  it("throws when the file does not exist", () => {
    expect(() => readBaseline(join(dir, "missing.properties"))).toThrow(/no duplication baseline/);
  });

  it("throws when main.percent is missing", () => {
    const file = join(dir, "baseline.properties");
    writeFileSync(file, "recorded=2026-09-12\nmain.largestCluster=100\n");

    expect(() => readBaseline(file)).toThrow(/main\.percent/);
  });

  it("throws when main.largestCluster is missing", () => {
    const file = join(dir, "baseline.properties");
    writeFileSync(file, "recorded=2026-09-12\nmain.percent=10\n");

    expect(() => readBaseline(file)).toThrow(/main\.largestCluster/);
  });

  it("defaults recorded to an empty string when absent", () => {
    const file = join(dir, "baseline.properties");
    writeFileSync(file, "main.percent=10\nmain.largestCluster=100\n");

    expect(readBaseline(file).recorded).toBe("");
  });
});

describe("readExemptions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-duplication-exemptions-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty list when the file does not exist", () => {
    expect(readExemptions(join(dir, "missing.txt"))).toEqual([]);
  });

  it("parses a reasoned pair", () => {
    const file = join(dir, "exemptions.txt");
    writeFileSync(file, "# data tables, not logic\na/*.ts :: b/*.ts\n");

    expect(readExemptions(file)).toEqual([
      { globA: "a/*.ts", globB: "b/*.ts", reason: "data tables, not logic" },
    ]);
  });

  it("concatenates multiple consecutive reason lines", () => {
    const file = join(dir, "exemptions.txt");
    writeFileSync(file, "# first line of the reason\n# second line\na.ts :: b.ts\n");

    expect(readExemptions(file)[0]?.reason).toBe("first line of the reason second line");
  });

  it("parses multiple blank-line-separated entries independently", () => {
    const file = join(dir, "exemptions.txt");
    writeFileSync(file, "# reason one\na.ts :: b.ts\n\n# reason two\nc.ts :: d.ts\n");

    expect(readExemptions(file)).toEqual([
      { globA: "a.ts", globB: "b.ts", reason: "reason one" },
      { globA: "c.ts", globB: "d.ts", reason: "reason two" },
    ]);
  });

  it("throws on a pair with no reason line above it — default-deny, never a silent pass", () => {
    const file = join(dir, "exemptions.txt");
    writeFileSync(file, "a.ts :: b.ts\n");

    expect(() => readExemptions(file)).toThrow(/no '# reason' line/);
  });

  it("a blank line resets the pending reason, so a pair after one still needs its own", () => {
    const file = join(dir, "exemptions.txt");
    writeFileSync(file, "# reason one\n\na.ts :: b.ts\n");

    expect(() => readExemptions(file)).toThrow(/no '# reason' line/);
  });

  it("throws on a malformed pair line (no ::)", () => {
    const file = join(dir, "exemptions.txt");
    writeFileSync(file, "# reason\na.ts b.ts\n");

    expect(() => readExemptions(file)).toThrow(/expected 'globA :: globB'/);
  });

  it("throws on a pair line with an empty side", () => {
    const file = join(dir, "exemptions.txt");
    writeFileSync(file, "# reason\na.ts :: \n");

    expect(() => readExemptions(file)).toThrow(/expected 'globA :: globB'/);
  });
});

describe("matchesGlob", () => {
  it("matches * against any run of characters except /", () => {
    expect(
      matchesGlob(
        "packages/clarity/src/*-dictionary.ts",
        "packages/clarity/src/verb-dictionary.ts",
      ),
    ).toBe(true);
  });

  it("does not let * cross a directory boundary", () => {
    expect(matchesGlob("packages/*.ts", "packages/clarity/src/verb-dictionary.ts")).toBe(false);
  });

  it("matches ** across directory boundaries", () => {
    expect(matchesGlob("packages/**/*.ts", "packages/clarity/src/verb-dictionary.ts")).toBe(true);
  });

  it("matches ? as exactly one character", () => {
    expect(matchesGlob("a?.ts", "ab.ts")).toBe(true);
    expect(matchesGlob("a?.ts", "abc.ts")).toBe(false);
  });

  it("escapes regex-special characters in the literal portions of the glob", () => {
    expect(matchesGlob("packages/clarity/src/foo.ts", "packages/clarity/srcXsrc/foo.ts")).toBe(
      false,
    );
  });
});

function occurrence(file: string, line = 1): { file: string; startLine: number; endLine: number } {
  return { file, startLine: line, endLine: line + 4 };
}

function cluster(tokens: number, fileA: string, fileB: string): DuplicationCluster {
  return { tokens, lines: 5, occurrences: [occurrence(fileA), occurrence(fileB, 100)] };
}

describe("isExempt", () => {
  const exemptions: readonly DuplicationExemption[] = [
    {
      globA: "packages/clarity/src/*-dictionary.ts",
      globB: "packages/clarity/src/*-dictionary.ts",
      reason: "data tables",
    },
  ];

  it("is exempt when every occurrence matches one of the pair's two globs", () => {
    const c = cluster(
      100,
      "packages/clarity/src/verb-dictionary.ts",
      "packages/clarity/src/abbreviation-dictionary.ts",
    );

    expect(isExempt(c, exemptions)).toBe(true);
  });

  it("is not exempt when only one occurrence matches — default-deny", () => {
    const c = cluster(
      100,
      "packages/clarity/src/verb-dictionary.ts",
      "packages/core/src/trace-namer.ts",
    );

    expect(isExempt(c, exemptions)).toBe(false);
  });

  it("is not exempt with no exemptions at all", () => {
    const c = cluster(100, "a.ts", "b.ts");

    expect(isExempt(c, [])).toBe(false);
  });
});

describe("decide", () => {
  const baseline: DuplicationBaseline = {
    recorded: "2026-09-12",
    mainPercent: 16.1,
    mainLargestCluster: 1559,
  };

  function tree(
    percent: number,
    clusters: readonly DuplicationCluster[] = [],
  ): DuplicationTreeResult {
    return { linesTotal: 1000, linesDuplicated: 100, percent, clusters };
  }

  it("passes when the percentage is at the baseline and no cluster exceeds the recorded largest", () => {
    const result = decide(tree(16.1, [cluster(1559, "a.ts", "b.ts")]), baseline, []);

    expect(result.passed).toBe(true);
    expect(result.message).toContain("within baseline");
  });

  it(`passes exactly at the ${PERCENT_TOLERANCE}-point tolerance boundary`, () => {
    // A literal, already-rounded-to-one-decimal value — real percents always come from
    // aggregate()'s own rounding — rather than baseline.mainPercent + PERCENT_TOLERANCE, whose
    // floating-point sum (16.1 + 0.3) lands fractionally above 16.4 and would make this its own
    // false failure, not a real one.
    const result = decide(tree(16.4), baseline, []);

    expect(result.passed).toBe(true);
  });

  it("fails when the percentage rises past the tolerance", () => {
    const result = decide(tree(baseline.mainPercent + PERCENT_TOLERANCE + 0.1), baseline, []);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("main duplication rose to");
  });

  it("fails when a non-exempt cluster is larger than the baseline's largest", () => {
    const c = cluster(baseline.mainLargestCluster + 1, "a.ts", "b.ts");

    const result = decide(tree(baseline.mainPercent, [c]), baseline, []);

    expect(result.passed).toBe(false);
    expect(result.message).toContain("new cluster");
    expect(result.message).toContain("a.ts:1");
  });

  it("an exempt cluster larger than the baseline's largest does not fail the check", () => {
    const exemptions: readonly DuplicationExemption[] = [
      {
        globA: "packages/clarity/src/*-dictionary.ts",
        globB: "packages/clarity/src/*-dictionary.ts",
        reason: "data tables",
      },
    ];
    const c = cluster(
      baseline.mainLargestCluster + 1,
      "packages/clarity/src/verb-dictionary.ts",
      "packages/clarity/src/abbreviation-dictionary.ts",
    );

    const result = decide(tree(baseline.mainPercent, [c]), baseline, exemptions);

    expect(result.passed).toBe(true);
  });

  it("anchors the largest-cluster ratchet on non-exempt clusters only, never an exempt one", () => {
    const exemptions: readonly DuplicationExemption[] = [
      {
        globA: "packages/clarity/src/*-dictionary.ts",
        globB: "packages/clarity/src/*-dictionary.ts",
        reason: "data tables",
      },
    ];
    const exemptCluster = cluster(
      50_000,
      "packages/clarity/src/verb-dictionary.ts",
      "packages/clarity/src/abbreviation-dictionary.ts",
    );

    const result = decide(tree(baseline.mainPercent, [exemptCluster]), baseline, exemptions);

    expect(result.passed).toBe(true);
    expect(result.message).toContain("largest non-exempt cluster 0 tokens");
  });

  it("reports every offending non-exempt cluster, not just the first", () => {
    const a = cluster(baseline.mainLargestCluster + 1, "a.ts", "b.ts");
    const c = cluster(baseline.mainLargestCluster + 2, "c.ts", "d.ts");

    const result = decide(tree(baseline.mainPercent, [a, c]), baseline, []);

    expect(result.message).toContain("a.ts:1");
    expect(result.message).toContain("c.ts:1");
  });
});
