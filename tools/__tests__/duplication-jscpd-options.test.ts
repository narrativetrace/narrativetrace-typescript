// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Proves, against the REAL pinned jscpd binary (no mock — the option names themselves are the
// thing under test), that `--ignore-identifiers --ignore-literals` is the option pair that gives
// "structural duplication, not merely pasted text": a fixture pair below differs ONLY in
// identifier names and string-literal contents, so it is a clone under those two flags and not a
// clone without them. See documentation/duplication.md's "Ignoring identifiers and literals"
// section, which this test backs.

const REPO_ROOT = process.cwd();

function jscpdBinary(): string {
  return join(REPO_ROOT, "node_modules/.bin/jscpd");
}

const FIRST_FIXTURE = `export function addNumbers(x: number, y: number): number {
  const total = x + y;
  console.log("sum computed");
  return total;
}
`;

// Same shape, different identifier names AND a different string literal — nothing textual in
// common beyond punctuation and keywords.
const SECOND_FIXTURE = `export function combineValues(m: number, n: number): number {
  const result = m + n;
  console.log("different message entirely");
  return result;
}
`;

interface DuplicatesReport {
  readonly duplicates: readonly unknown[];
}

function runJscpd(
  fixtureDir: string,
  outDir: string,
  extraFlags: readonly string[],
): DuplicatesReport {
  execFileSync(
    jscpdBinary(),
    [
      fixtureDir,
      "--min-tokens",
      "10",
      "--min-lines",
      "1",
      ...extraFlags,
      "--reporters",
      "json",
      "--output",
      outDir,
      "--silent",
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );
  return JSON.parse(readFileSync(join(outDir, "jscpd-report.json"), "utf-8")) as DuplicatesReport;
}

describe("jscpd --ignore-identifiers --ignore-literals (real binary, fixture proof)", () => {
  let fixtureDir: string;
  let outDir: string;

  beforeEach(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "nt-duplication-fixture-"));
    outDir = mkdtempSync(join(tmpdir(), "nt-duplication-fixture-out-"));
    writeFileSync(join(fixtureDir, "a.ts"), FIRST_FIXTURE);
    writeFileSync(join(fixtureDir, "b.ts"), SECOND_FIXTURE);
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  });

  it("finds the pair as a clone once identifiers and literals are ignored", () => {
    const report = runJscpd(fixtureDir, outDir, ["--ignore-identifiers", "--ignore-literals"]);

    expect(report.duplicates).toHaveLength(1);
  });

  it("does NOT find the pair as a clone without those flags — different names and literals are real differences", () => {
    const report = runJscpd(fixtureDir, outDir, []);

    expect(report.duplicates).toHaveLength(0);
  });
});
