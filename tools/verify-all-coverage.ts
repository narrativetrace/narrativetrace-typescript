// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";

export interface CoverageTotals {
  readonly covered: number;
  readonly missed: number;
}

interface CoverageSummaryJson {
  readonly total: {
    readonly lines: { readonly total: number; readonly covered: number };
  };
}

/**
 * Reads one package's `coverage/coverage-summary.json` (vitest's `--coverage.reporter=json-summary`)
 * and returns raw line counts — never a percentage, so aggregation across packages sums real
 * counts first (mirrors Java's `CoverageReportSupport`, which does the same over JaCoCo XML rather
 * than averaging each module's own percentage).
 */
export function readCoverageTotals(path: string): CoverageTotals {
  const summary = JSON.parse(readFileSync(path, "utf-8")) as CoverageSummaryJson;
  const { total, covered } = summary.total.lines;
  return { covered, missed: total - covered };
}

export function aggregateCoverage(totals: readonly CoverageTotals[]): {
  readonly coveragePct: number;
  readonly linesCovered: number;
  readonly linesMissed: number;
} {
  const linesCovered = totals.reduce((sum, t) => sum + t.covered, 0);
  const linesMissed = totals.reduce((sum, t) => sum + t.missed, 0);
  const denominator = linesCovered + linesMissed;
  const coveragePct = denominator === 0 ? 0 : (linesCovered / denominator) * 100;
  return { coveragePct, linesCovered, linesMissed };
}
