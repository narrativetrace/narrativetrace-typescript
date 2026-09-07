// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { type CliDeps, parseClarityArgs, runClarityCli } from "../src/clarity-cli.js";

const REPORT = JSON.stringify({
  version: "1.0",
  scenarios: [
    {
      name: "Good",
      overallScore: 0.85,
      methodNameScore: 0.9,
      classNameScore: 0.8,
      parameterNameScore: 0.9,
      structuralScore: 1.0,
      cohesionScore: 0.7,
      issues: [],
    },
    {
      name: "Bad",
      overallScore: 0.3,
      methodNameScore: 0.2,
      classNameScore: 0.2,
      parameterNameScore: 0.4,
      structuralScore: 1.0,
      cohesionScore: 0.7,
      issues: [
        {
          category: "class-name",
          element: "Helper",
          suggestion: "Use a domain-specific name",
          severity: "HIGH",
          occurrences: 1,
          impactScore: 3,
        },
      ],
    },
  ],
});

function memDeps(files: Record<string, string> = {}): CliDeps & {
  writes: Record<string, string>;
  out: string[];
  err: string[];
} {
  const writes: Record<string, string> = {};
  const out: string[] = [];
  const err: string[] = [];
  return {
    writes,
    out,
    err,
    readFile: (path) => {
      const key = Object.keys(files).find((k) => path.endsWith(k));
      if (key === undefined) throw new Error(`ENOENT: ${path}`);
      return files[key] as string;
    },
    writeFile: (path, content) => {
      writes[path] = content;
    },
    mkdir: () => {},
    log: (m) => out.push(m),
    error: (m) => err.push(m),
  };
}

describe("parseClarityArgs", () => {
  test("defaults: format both, output-dir '.', input clarity-results.json", () => {
    const opts = parseClarityArgs([]);
    expect(opts).toMatchObject({ format: "both", outputDir: ".", warnOnly: false });
  });

  test("parses format, output-dir, max-high-issues, min-score, warn-only", () => {
    const opts = parseClarityArgs([
      "--format",
      "md",
      "--output-dir",
      "build/clarity",
      "--max-high-issues",
      "3",
      "--min-score",
      "0.6",
      "--warn-only",
    ]);
    expect(opts).toMatchObject({
      format: "md",
      outputDir: "build/clarity",
      maxHighIssues: 3,
      minScore: 0.6,
      warnOnly: true,
    });
  });

  test("unknown format throws a usage error carrying exit code 2", () => {
    expect(() => parseClarityArgs(["--format", "yaml"])).toThrow(/Unknown format/);
    try {
      parseClarityArgs(["--format", "yaml"]);
    } catch (e) {
      expect((e as { exitCode?: number }).exitCode).toBe(2);
    }
  });
});

describe("runClarityCli", () => {
  test("unknown format exits 2 without writing", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    const code = runClarityCli(["--format", "yaml"], deps);
    expect(code).toBe(2);
    expect(Object.keys(deps.writes)).toHaveLength(0);
    expect(deps.err.join("\n")).toMatch(/Unknown format/);
  });

  test("format both writes report.md and results.json", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    const code = runClarityCli(["--output-dir", "out"], deps);
    expect(code).toBe(0);
    expect(deps.writes["out/clarity-report.md"]).toContain("# Clarity Suite Report");
    expect(deps.writes["out/clarity-results.json"]).toContain('"scenarios"');
  });

  test("format md writes only the markdown report", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    runClarityCli(["--format", "md", "--output-dir", "out"], deps);
    expect(deps.writes["out/clarity-report.md"]).toBeDefined();
    expect(deps.writes["out/clarity-results.json"]).toBeUndefined();
  });

  test("format json writes only the json report", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    runClarityCli(["--format", "json", "--output-dir", "out"], deps);
    expect(deps.writes["out/clarity-results.json"]).toBeDefined();
    expect(deps.writes["out/clarity-report.md"]).toBeUndefined();
  });

  test("--max-high-issues below the actual HIGH count fails the gate (exit 1)", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    const code = runClarityCli(["--max-high-issues", "0", "--output-dir", "out"], deps);
    expect(code).toBe(1);
    expect(deps.err.join("\n")).toMatch(/HIGH/);
  });

  test("--min-score above a scenario's score fails the gate (exit 1)", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    const code = runClarityCli(["--min-score", "0.7", "--output-dir", "out"], deps);
    expect(code).toBe(1);
    expect(deps.err.join("\n")).toMatch(/Bad/);
  });

  test("--warn-only downgrades gate failures to warnings (exit 0)", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    const code = runClarityCli(["--min-score", "0.7", "--warn-only", "--output-dir", "out"], deps);
    expect(code).toBe(0);
    expect(deps.out.join("\n")).toMatch(/warning/i);
  });

  test("passing gate with no thresholds exits 0", () => {
    const deps = memDeps({ "clarity-results.json": REPORT });
    expect(runClarityCli(["--output-dir", "out"], deps)).toBe(0);
  });

  test("missing input file exits 1 with an error", () => {
    const deps = memDeps({});
    const code = runClarityCli(["--output-dir", "out"], deps);
    expect(code).toBe(1);
    expect(deps.err.join("\n")).toMatch(/ENOENT|not found|read/i);
  });
});
