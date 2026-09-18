// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildTreeResult,
  type DuplicationScanResult,
  mainSourceDirs,
  type RawJscpdReport,
  summaryLine,
  testSourceDirs,
  writeScanJson,
} from "./duplication-shared.js";

// Runs jscpd (pinned exact devDependency at the workspace root) over main and test sources
// separately and writes `reports/duplication/duplication.json` + a one-line console summary,
// every commit. `tools/duplication-check.ts` reads that JSON and ratchets the main tree against
// `config/duplication/baseline.properties` — see documentation/duplication.md for the full
// rationale (token floor, identifiers/literals ignored, main-only gate, ratchet not a fixed
// percentage). This file is thin, untested glue over the tool — mirroring the Java canonical repo's
// own DuplicationReportSupport.runCpd: the pure normalisation it hands off to
// (`tools/duplication-shared.ts`) is what the test suite exercises, not a live jscpd run.

/** Token floor (owner ruling 2026-09-12, family-wide): below this, a match is usually two
 * unrelated blocks that happen to share a short, common shape — not a structural copy worth
 * acting on. */
const MIN_TOKENS = 60;

const REPORT_PATH = "reports/duplication/duplication.json";

/** Excluded everywhere: build output, dependencies, coverage instrumentation, and anything a
 * build step generates rather than a person writes. */
const IGNORE_GLOBS = "**/node_modules/**,**/dist/**,**/coverage/**,**/build/**";

/** Restricted to actual source-code formats — jscpd auto-detects by extension across everything
 * under a scanned directory, and without this the test tree's `examples/**` pulls in incidental
 * JSON/YAML/HTML "duplication" (near-identical example `package.json`/CI config files) that is
 * noise for this gate's purpose, not code structure worth a finding. */
const FORMATS = "typescript,tsx,javascript";

function jscpdBinary(repoRoot: string): string {
  return join(repoRoot, "node_modules/.bin/jscpd");
}

const EMPTY_REPORT: RawJscpdReport = { duplicates: [], statistics: { total: { lines: 0 } } };

/**
 * Runs jscpd over [dirs] at {@link MIN_TOKENS}, with identifiers and literals ignored (see
 * documentation/duplication.md's fixture proof for exactly why `--ignore-identifiers
 * --ignore-literals` is the option pair that gives "structural duplication, not merely pasted
 * text"). `dirs` with none existing (a package with no `__tests__`, say) contributes nothing,
 * same as the Java canonical repo's own `runCpd` skipping non-existent source directories.
 */
function runJscpd(repoRoot: string, dirs: readonly string[]): RawJscpdReport {
  const existing = dirs.filter((d) => existsSync(d));
  if (existing.length === 0) return EMPTY_REPORT;
  const outDir = mkdtempSync(join(tmpdir(), "nt-duplication-"));
  try {
    execFileSync(
      jscpdBinary(repoRoot),
      [
        ...existing,
        "--min-tokens",
        String(MIN_TOKENS),
        "--min-lines",
        "1", // the only real floor is the token count above; a line minimum would be a second,
        // undocumented gate this build never asked for.
        "--ignore-identifiers",
        "--ignore-literals",
        "--absolute",
        "--format",
        FORMATS,
        "--ignore",
        IGNORE_GLOBS,
        "--reporters",
        "json",
        "--output",
        outDir,
        "--silent",
      ],
      { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] },
    );
    return JSON.parse(readFileSync(join(outDir, "jscpd-report.json"), "utf-8")) as RawJscpdReport;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function main(): void {
  const repoRoot = process.cwd();
  const mainRaw = runJscpd(repoRoot, mainSourceDirs(repoRoot));
  const testRaw = runJscpd(repoRoot, testSourceDirs(repoRoot));
  const scan: DuplicationScanResult = {
    tool: "jscpd",
    language: "typescript",
    minTokens: MIN_TOKENS,
    main: buildTreeResult(mainRaw, repoRoot),
    test: buildTreeResult(testRaw, repoRoot),
  };
  writeScanJson(scan, join(repoRoot, REPORT_PATH));
  console.log(summaryLine(scan));
}

main();
