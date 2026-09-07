// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  exportClarityJsonReport,
  renderClaritySuiteReport,
  type ScenarioResult,
} from "@narrativetrace/clarity";
import { ConsoleSummaryReporter } from "./console-summary-reporter.js";

/**
 * Per-process registry that fixtures push into as each test completes. Vitest fixtures have no
 * suite-close hook, so accumulation happens here and is drained by the suite reporter/globalSetup
 * teardown once every test in the process has run (Java's suite-level `NarrativeTraceExtension`
 * behaviour). Duplicate scenario names are retained — different test files may share a display name
 * and each run is a distinct data point.
 */
const registry: ScenarioResult[] = [];

export function recordClarityScenario(entry: ScenarioResult): void {
  registry.push(entry);
}

export function clarityScenarioCount(): number {
  return registry.length;
}

/** Returns a copy of the accumulated scenarios (insertion order) and clears the registry. */
export function drainClarityScenarios(): ScenarioResult[] {
  const copy = [...registry];
  registry.length = 0;
  return copy;
}

/** Injected IO so artifact writing is testable without the real filesystem. */
export interface SuiteArtifactSink {
  mkdir: (dir: string) => void;
  writeFile: (path: string, content: string) => void;
}

export interface SuiteArtifactOutcome {
  written: boolean;
  jsonPath?: string;
  reportPath?: string;
}

/**
 * Writes ONE `clarity-results.json` (all N entries, insertion order, duplicates retained) and ONE
 * `clarity-report.md` (Java suite-report shape) to `outputDir`. An empty suite writes nothing — no
 * empty files, matching the fixture's "empty trace writes nothing" contract.
 */
export function writeSuiteClarityArtifacts(
  entries: readonly ScenarioResult[],
  outputDir: string,
  sink: SuiteArtifactSink,
): SuiteArtifactOutcome {
  if (entries.length === 0) return { written: false };
  sink.mkdir(outputDir);
  const jsonPath = `${outputDir}/clarity-results.json`;
  const reportPath = `${outputDir}/clarity-report.md`;
  sink.writeFile(jsonPath, exportClarityJsonReport(entries));
  sink.writeFile(reportPath, renderClaritySuiteReport(entries));
  return { written: true, jsonPath, reportPath };
}

/**
 * Builds the one-shot suite footer (Java `ConsoleSummaryReporter.formatSuiteFooter`) with the
 * high/moderate/low clarity split. Returns undefined for an empty suite so callers print nothing.
 */
export function suiteClarityFooter(
  entries: readonly ScenarioResult[],
  outputPath: string,
): string | undefined {
  if (entries.length === 0) return undefined;
  const scores = entries.map((e) => e.result.overall);
  return new ConsoleSummaryReporter().formatSuiteFooter(entries.length, outputPath, scores);
}
