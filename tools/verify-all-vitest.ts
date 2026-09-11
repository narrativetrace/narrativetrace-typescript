// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";

/** One test *file*'s outcome from a vitest JSON-reporter run — the unit `verify:all` slices on. */
export interface TestFileEntry {
  readonly module: string;
  readonly file: string;
  readonly testsPassed: number;
  readonly testsFailed: number;
  readonly testsSkipped: number;
  readonly timeSeconds: number;
}

interface VitestAssertion {
  readonly status: string;
}

interface VitestTestResult {
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly assertionResults: readonly VitestAssertion[];
}

interface VitestJsonReport {
  readonly testResults: readonly VitestTestResult[];
}

function countBy(assertions: readonly VitestAssertion[], status: string): number {
  return assertions.filter((a) => a.status === status).length;
}

function toFileEntry(module: string, result: VitestTestResult): TestFileEntry {
  const passed = countBy(result.assertionResults, "passed");
  const failed = countBy(result.assertionResults, "failed");
  return {
    module,
    file: result.name,
    testsPassed: passed,
    testsFailed: failed,
    testsSkipped: result.assertionResults.length - passed - failed,
    timeSeconds: (result.endTime - result.startTime) / 1000,
  };
}

/**
 * Reads one `vitest run --reporter=json --outputFile=<path>` report and returns one
 * {@link TestFileEntry} per test file, tagged with `module` — the equivalent of Java's
 * `JUnitAggregateSupport.readModuleTestResults` reading a subproject's own JUnit XML.
 *
 * @throws {Error} when `path` is missing or not a well-formed vitest JSON report.
 */
export function readVitestResults(path: string, module: string): TestFileEntry[] {
  const report = JSON.parse(readFileSync(path, "utf-8")) as VitestJsonReport;
  return report.testResults.map((result) => toFileEntry(module, result));
}

export interface TestSummary {
  readonly tests_passed: number;
  readonly tests_failed: number;
  readonly tests_skipped: number;
  readonly test_classes: number;
}

/** The four `tests_passed`/`tests_failed`/`tests_skipped`/`test_classes` metric keys, summed. */
export function summarize(entries: readonly TestFileEntry[]): TestSummary {
  return {
    tests_passed: entries.reduce((sum, e) => sum + e.testsPassed, 0),
    tests_failed: entries.reduce((sum, e) => sum + e.testsFailed, 0),
    tests_skipped: entries.reduce((sum, e) => sum + e.testsSkipped, 0),
    test_classes: entries.length,
  };
}

/** `true` iff every entry has zero failures — an empty slice counts as green (nothing ran, nothing failed). */
export function allGreen(entries: readonly TestFileEntry[]): boolean {
  return entries.every((e) => e.testsFailed === 0);
}

export function totalSeconds(entries: readonly TestFileEntry[]): number {
  return entries.reduce((sum, e) => sum + e.timeSeconds, 0);
}

/** Entries whose `file` path contains `substring` — the slicing primitive every derived category uses. */
export function matchingPath(
  entries: readonly TestFileEntry[],
  substring: string,
): TestFileEntry[] {
  return entries.filter((e) => e.file.includes(substring));
}

/** Entries belonging to `module` exactly — used to slice a whole package's suite (e.g. fuzz-tier-a). */
export function matchingModule(entries: readonly TestFileEntry[], module: string): TestFileEntry[] {
  return entries.filter((e) => e.module === module);
}
