// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClarityIssue, ClarityResult } from "./clarity-analyzer.js";

export type ScenarioResult = {
  readonly scenario: string;
  readonly result: ClarityResult;
};

const SEVERITY_ICON: Record<ClarityIssue["severity"], string> = {
  HIGH: "!!!",
  MEDIUM: "!!",
  LOW: "!",
};

function fmt(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function renderScoreRow({ scenario, result }: ScenarioResult): string {
  return `| ${scenario} | ${fmt(result.overall)} | ${fmt(result.method)} | ${fmt(result.class)} | ${fmt(result.parameter)} | ${fmt(result.structural)} | ${fmt(result.cohesion)} |`;
}

function renderIssuesSection(results: readonly ScenarioResult[]): string[] {
  const allIssues = results.flatMap(({ scenario, result }) =>
    result.issues.map((issue) => ({ scenario, ...issue })),
  );
  if (allIssues.length === 0) return [];
  return [
    "",
    "## Issues",
    "",
    ...allIssues.map((issue) => {
      const count = issue.occurrences > 1 ? ` (x${issue.occurrences})` : "";
      return `- **[${SEVERITY_ICON[issue.severity]}]** ${issue.scenario}: ${issue.element}${count} — ${issue.suggestion}`;
    }),
  ];
}

export function renderClarityReport(results: readonly ScenarioResult[]): string {
  return [
    "# Clarity Report",
    "",
    "| Scenario | Overall | Method | Class | Parameter | Structural | Cohesion |",
    "|----------|---------|--------|-------|-----------|------------|----------|",
    ...results.map(renderScoreRow),
    ...renderIssuesSection(results),
    "",
  ].join("\n");
}

// Suite report thresholds/weights mirror Java ClarityReportRenderer (cross-language contract).
const LOW_SCORE_THRESHOLD = 0.7;

/** 2-decimal fixed formatting to match Java's `%.2f` (scores are a cross-language contract). */
function fmt2(value: number): string {
  return value.toFixed(2);
}

function weightedScoresTable(result: ClarityResult): string[] {
  const row = (label: string, score: number, weight: number): string =>
    `| ${label} | ${fmt2(score)} | ${weight.toFixed(2)} | ${fmt2(score * weight)} |`;
  return [
    "## Scores",
    "",
    "| Category | Score | Weight | Weighted |",
    "|----------|-------|--------|----------|",
    row("Method Names", result.method, 0.3),
    row("Class Names", result.class, 0.2),
    row("Parameter Names", result.parameter, 0.25),
    row("Structural", result.structural, 0.15),
    row("Cohesion", result.cohesion, 0.1),
    `| **Overall** | **${fmt2(result.overall)}** | | |`,
  ];
}

function suiteIssuesTable(result: ClarityResult): string[] {
  const sorted = [...result.issues].sort((a, b) => b.impactScore - a.impactScore);
  return [
    "| Severity | Category | Element | Suggestion |",
    "|----------|----------|---------|------------|",
    ...sorted.map((issue) => {
      const element =
        issue.occurrences > 1
          ? `\`${issue.element}\` (x${issue.occurrences})`
          : `\`${issue.element}\``;
      return `| ${issue.severity} | ${issue.category} | ${element} | ${issue.suggestion} |`;
    }),
  ];
}

/**
 * Suite-level Markdown report (Java `ClarityReportRenderer.renderSuiteReport` parity): an ascending
 * scenario table followed by a weighted-scores + issues detail block for every scenario that scores
 * below 0.7 AND carries issues. Duplicate scenario names are preserved as separate rows so results
 * from test classes sharing a display name are not collapsed. `# Clarity Suite Report` header is
 * emitted even for an empty suite.
 */
export function renderClaritySuiteReport(results: readonly ScenarioResult[]): string {
  const sorted = [...results].sort((a, b) => a.result.overall - b.result.overall);
  const details = sorted.filter(needsDetail).flatMap(detailBlock);
  return [...scenarioTable(sorted), ...details].join("\n");
}

/** Header plus the ascending scenario/score table — emitted even for an empty suite. */
function scenarioTable(sorted: readonly ScenarioResult[]): string[] {
  return [
    "# Clarity Suite Report",
    "",
    "## Scenarios",
    "",
    "| Scenario | Score |",
    "|----------|-------|",
    ...sorted.map(({ scenario, result }) => `| ${scenario} | ${fmt2(result.overall)} |`),
  ];
}

/** Only low-scoring scenarios that actually carry issues earn a detail block. */
function needsDetail({ result }: ScenarioResult): boolean {
  return result.overall < LOW_SCORE_THRESHOLD && result.issues.length > 0;
}

function detailBlock({ scenario, result }: ScenarioResult): string[] {
  return [
    "",
    `### ${scenario}`,
    "",
    ...weightedScoresTable(result),
    "",
    ...suiteIssuesTable(result),
  ];
}
