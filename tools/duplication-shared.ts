// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

// Duplication detection via jscpd (Copy/Paste Detector) — a report every commit, a ratchet against
// a committed baseline, never a fixed percentage. See documentation/duplication.md for the
// floor/ratchet/exemption rules `tools/duplication-check.ts` enforces; that doc is the one to
// update if either changes. This module holds the pure, unit-tested half: turning jscpd's own JSON
// into this repo's normalised `duplication.json` shape. The jscpd invocation itself
// (`tools/duplication-report.ts`) is thin, untested glue over the tool — mirroring the Java canonical
// repo's own DuplicationReportSupport convention: the real tool is proven by the actual gate, not a
// unit test that would just re-run it.

/** One occurrence of a duplicated block, relative to the repository root (`packages/x/src/y.ts`). */
export interface DuplicationOccurrence {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * One jscpd duplicate finding. jscpd reports duplication as PAIRS: every entry in its own
 * `duplicates` array names exactly two occurrences of one shape — unlike the Java canonical repo's
 * PMD CPD, which groups every mutually-matching occurrence into one N-way cluster. A shape copied
 * three times therefore shows up here as multiple pairwise clusters (A↔B, A↔C, …), never one
 * three-occurrence cluster — see documentation/duplication.md for what this means when reading a
 * report.
 */
export interface DuplicationCluster {
  readonly tokens: number;
  readonly lines: number;
  readonly occurrences: readonly [DuplicationOccurrence, DuplicationOccurrence];
}

/** One source tree's scan (main or test): jscpd's own line count plus this build's clusters/percent. */
export interface DuplicationTreeResult {
  readonly linesTotal: number;
  readonly linesDuplicated: number;
  readonly percent: number;
  readonly clusters: readonly DuplicationCluster[];
}

/** The whole `duplication.json` document. */
export interface DuplicationScanResult {
  readonly tool: "jscpd";
  readonly language: string;
  readonly minTokens: number;
  readonly main: DuplicationTreeResult;
  readonly test: DuplicationTreeResult;
}

/** The subset of jscpd's own `--reporters json` output this module reads. */
export interface RawJscpdFileRef {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

export interface RawJscpdDuplicate {
  readonly firstFile: RawJscpdFileRef;
  readonly secondFile: RawJscpdFileRef;
  readonly tokens: number;
  readonly lines: number;
}

export interface RawJscpdReport {
  readonly duplicates: readonly RawJscpdDuplicate[];
  readonly statistics: { readonly total: { readonly lines: number } };
}

/** An absolute jscpd file path (jscpd was invoked with `--absolute`), repo-root-relative with `/`
 * separators regardless of host OS — the same normalisation the Java canonical repo's own
 * `toCluster` applies to CPD's paths. */
export function toRelativePath(repoRoot: string, absolutePath: string): string {
  return relative(repoRoot, absolutePath).split(sep).join("/");
}

function toOccurrence(ref: RawJscpdFileRef, repoRoot: string): DuplicationOccurrence {
  return { file: toRelativePath(repoRoot, ref.name), startLine: ref.start, endLine: ref.end };
}

function toCluster(duplicate: RawJscpdDuplicate, repoRoot: string): DuplicationCluster {
  return {
    tokens: duplicate.tokens,
    lines: duplicate.lines,
    occurrences: [
      toOccurrence(duplicate.firstFile, repoRoot),
      toOccurrence(duplicate.secondFile, repoRoot),
    ],
  };
}

/** jscpd's raw duplicates, normalised and sorted largest-first (by tokens) — the order
 * `summaryLine` and the check's "largest cluster" reporting both rely on. */
export function buildClusters(raw: RawJscpdReport, repoRoot: string): DuplicationCluster[] {
  return raw.duplicates.map((d) => toCluster(d, repoRoot)).sort((a, b) => b.tokens - a.tokens);
}

/** A half-open line span `[start, end)` inside one file. */
interface LineSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * How many distinct line positions the (already same-file) half-open [spans] cover, counting a
 * position once no matter how many spans include it — the union, not the sum. Mirrors the Java
 * canonical repo's `countCoveredPositions`, adapted from CPD's single shared token-index coordinate
 * space to jscpd's per-file line numbers: line 5 of one file and line 5 of another are different
 * positions, so spans must be grouped and unioned per file (see {@link sumDuplicatedLines}) before
 * being summed across files — never unioned directly across files by line number.
 */
export function countCoveredLines(spans: readonly LineSpan[]): number {
  const [first, ...rest] = [...spans].sort((a, b) => a.start - b.start);
  if (!first) return 0;
  let covered = 0;
  let currentStart = first.start;
  let currentEnd = first.end;
  for (const span of rest) {
    if (span.start > currentEnd) {
      covered += currentEnd - currentStart;
      currentStart = span.start;
      currentEnd = span.end;
    } else if (span.end > currentEnd) {
      currentEnd = span.end;
    }
  }
  return covered + (currentEnd - currentStart);
}

/**
 * The tree's duplicated-line count: a union over line ranges, grouped by file first. jscpd's
 * matches overlap routinely (the same lines recur in several different pairs — a shape copied
 * three times reports as three pairwise clusters, each re-covering the same lines), and summing
 * every cluster's line count once per occurrence double- and triple-counts those positions — the
 * same "union, not sum" fix the Java canonical repo's own duplication tooling applies to CPD's token
 * spans, applied here to jscpd's per-file line ranges instead (see documentation/duplication.md).
 */
export function sumDuplicatedLines(clusters: readonly DuplicationCluster[]): number {
  const byFile = new Map<string, LineSpan[]>();
  for (const cluster of clusters) {
    for (const occurrence of cluster.occurrences) {
      const spans = byFile.get(occurrence.file) ?? [];
      spans.push({ start: occurrence.startLine, end: occurrence.endLine + 1 });
      byFile.set(occurrence.file, spans);
    }
  }
  let total = 0;
  for (const spans of byFile.values()) total += countCoveredLines(spans);
  return total;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Aggregates already-normalised clusters and jscpd's own total line count into a tree-level
 * result. Pure (no I/O) — this, {@link countCoveredLines} and {@link sumDuplicatedLines} are what
 * the test suite exercises directly, independent of running jscpd. `percent` can never exceed
 * 100%, by construction: it is a union over line positions bounded by `linesTotal`, never a sum
 * over clusters.
 */
export function aggregate(
  linesTotal: number,
  clusters: readonly DuplicationCluster[],
): DuplicationTreeResult {
  const linesDuplicated = sumDuplicatedLines(clusters);
  const percent = linesTotal === 0 ? 0 : roundToOneDecimal((linesDuplicated / linesTotal) * 100);
  return { linesTotal, linesDuplicated, percent, clusters };
}

/** Normalises one raw jscpd report (main or test tree) into this build's `DuplicationTreeResult`. */
export function buildTreeResult(raw: RawJscpdReport, repoRoot: string): DuplicationTreeResult {
  return aggregate(raw.statistics.total.lines, buildClusters(raw, repoRoot));
}

export function writeScanJson(scan: DuplicationScanResult, filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(scan, null, 2)}\n`);
}

export function readScanJson(filePath: string): DuplicationScanResult {
  return JSON.parse(readFileSync(filePath, "utf-8")) as DuplicationScanResult;
}

function largestClusterDescription(tree: DuplicationTreeResult): string {
  const largest = tree.clusters[0]; // buildClusters already sorted largest-first, by tokens
  if (!largest) return "no clusters";
  const [a, b] = largest.occurrences;
  return `largest ${largest.tokens} tokens ${a.file}:${a.startLine} ↔ ${b.file}:${b.startLine}`;
}

/** The one console summary line: main's percent/cluster count/largest cluster (the thing
 * `tools/duplication-check.ts` acts on), then test's (reported only — see documentation/duplication.md). */
export function summaryLine(scan: DuplicationScanResult): string {
  const main = scan.main;
  const test = scan.test;
  return (
    `duplication: main ${main.percent.toFixed(1)}% of lines in ${main.clusters.length} clusters ` +
    `(${largestClusterDescription(main)}) · test ${test.percent.toFixed(1)}% in ` +
    `${test.clusters.length} clusters (reported, not gated)`
  );
}

function existingSubdirectories(parent: string): string[] {
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parent, entry.name))
    .sort();
}

/** Every workspace package's `src` directory that actually exists — read straight off disk (like
 * the Java canonical repo's own `duplicationSourceDirs`), never hand-kept, so a 21st package is
 * scanned the moment it exists. */
export function mainSourceDirs(repoRoot: string): string[] {
  return existingSubdirectories(join(repoRoot, "packages"))
    .map((dir) => join(dir, "src"))
    .filter((dir) => existsSync(dir));
}

/**
 * The reported-only test tree: every workspace package's `__tests__` directory, plus `examples/`
 * (worked, tested example apps) and `tools/__tests__` (this repo's own tooling tests) — see
 * documentation/duplication.md for why these are measured but never gate.
 */
export function testSourceDirs(repoRoot: string): string[] {
  const perPackage = existingSubdirectories(join(repoRoot, "packages"))
    .map((dir) => join(dir, "__tests__"))
    .filter((dir) => existsSync(dir));
  const shared = [join(repoRoot, "examples"), join(repoRoot, "tools/__tests__")].filter((dir) =>
    existsSync(dir),
  );
  return [...perPackage, ...shared];
}
