// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioDelta } from "@narrativetrace/core-node";

const HIGH_THRESHOLD = 0.7;
const MODERATE_THRESHOLD = 0.4;

interface Buckets {
  high: number;
  moderate: number;
  low: number;
}

function bucketScores(scores: readonly number[]): Buckets {
  const buckets: Buckets = { high: 0, moderate: 0, low: 0 };
  for (const score of scores) {
    if (score >= HIGH_THRESHOLD) buckets.high++;
    else if (score >= MODERATE_THRESHOLD) buckets.moderate++;
    else buckets.low++;
  }
  return buckets;
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((100 * count) / total);
}

/** Scenario names are capped so one changed scenario cannot flood the one-line summary. */
function truncateScenario(scenario: string): string {
  return scenario.length <= 32 ? scenario : `${scenario.slice(0, 32).trimEnd()}…`;
}

/**
 * The `  run: <name>\n` line, or nothing at all when there is no enclosing run to name — a caller
 * rendering a footer standalone, or an integration that has not adopted `RunIdentity` yet
 * (2026-09-13 ruling, item 2).
 */
function runLine(runName: string | undefined): string {
  return runName === undefined ? "" : `  run: ${runName}\n`;
}

/** The word "scenario(s)" rides on the first segment only: `4 scenarios unchanged · 1 new`. */
function withNoun(segments: readonly string[], count: number): string {
  if (segments.length > 0) return String(count);
  return `${count} ${count === 1 ? "scenario" : "scenarios"}`;
}

function countKind(deltas: readonly ScenarioDelta[], kind: ScenarioDelta["kind"]): number {
  return deltas.filter((d) => d.kind === kind).length;
}

function describeChanged(changed: readonly ScenarioDelta[]): string {
  return changed.map((d) => `"${truncateScenario(d.scenario)}" (${d.summary})`).join(", ");
}

/**
 * Byte-for-byte console formatting of the NarrativeTrace suite report — the same layout every
 * runtime prints. Clarity scores bucket at 0.7 (high) / 0.4 (moderate); an empty
 * suite reports 0% in every band without dividing by zero.
 */
export class ConsoleSummaryReporter {
  formatTestResult(testName: string, durationMs: number, clarityScore?: number): string {
    if (clarityScore === undefined) return `    ✓ ${testName} (${durationMs}ms)`;
    return `    ✓ ${testName} (${durationMs}ms, clarity: ${clarityScore.toFixed(2)})`;
  }

  formatTestFailure(
    testName: string,
    durationMs: number,
    exceptionType: string,
    location: string,
    traceFilePath: string,
  ): string {
    return (
      `    ✗ ${testName} (${durationMs}ms)\n` +
      `      > ${exceptionType} at ${location}\n` +
      `      > Full trace: ${traceFilePath}`
    );
  }

  formatSuiteHeader(): string {
    return "NarrativeTrace — Recording test narratives\n";
  }

  /**
   * @param runName the enclosing test-suite run's three-word phrase, or `undefined` outside a
   * tracked run (2026-09-13 ruling, item 2) — an own `  run: <name>\n` line right after the header,
   * never folded into the scenario count or the clarity split.
   */
  formatSuiteFooter(
    scenarioCount: number,
    outputPath: string,
    clarityScores?: readonly number[],
    runName?: string,
  ): string {
    const head =
      `\nNarrativeTrace — Suite complete\n${runLine(runName)}` +
      `  ${scenarioCount} scenarios recorded\n`;
    if (!clarityScores) return `${head}  Reports: ${outputPath}`;
    const { high, moderate, low } = bucketScores(clarityScores);
    const total = clarityScores.length;
    const clarity =
      `  Clarity: ${percent(high, total)}% high | ` +
      `${percent(moderate, total)}% moderate | ${percent(low, total)}% low\n`;
    return `${head}${clarity}  Reports: ${outputPath}`;
  }

  /**
   * One line summarizing every scenario's structural status against its last-green artifact, e.g.
   * `4 scenarios unchanged · 1 changed: "Weekend trip…" (+4 calls CurrencyConverter.toBaseCurrency)`.
   * Empty for an empty list — callers should print nothing rather than a blank "Since last green:".
   */
  formatDeltaLine(deltas: readonly ScenarioDelta[]): string {
    const unchanged = countKind(deltas, "unchanged");
    const fresh = countKind(deltas, "new");
    const changed = deltas.filter((d) => d.kind === "changed");
    const segments: string[] = [];
    if (unchanged > 0) segments.push(`${withNoun(segments, unchanged)} unchanged`);
    if (fresh > 0) segments.push(`${withNoun(segments, fresh)} new`);
    if (changed.length > 0) {
      segments.push(`${withNoun(segments, changed.length)} changed: ${describeChanged(changed)}`);
    }
    return segments.join(" · ");
  }
}
