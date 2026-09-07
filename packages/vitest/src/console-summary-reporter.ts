// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
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

  formatSuiteFooter(
    scenarioCount: number,
    outputPath: string,
    clarityScores?: readonly number[],
  ): string {
    const head = `\nNarrativeTrace — Suite complete\n  ${scenarioCount} scenarios recorded\n`;
    if (!clarityScores) return `${head}  Reports: ${outputPath}`;
    const { high, moderate, low } = bucketScores(clarityScores);
    const total = clarityScores.length;
    const clarity =
      `  Clarity: ${percent(high, total)}% high | ` +
      `${percent(moderate, total)}% moderate | ${percent(low, total)}% low\n`;
    return `${head}${clarity}  Reports: ${outputPath}`;
  }
}
