// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClarityResult } from "./clarity-analyzer.js";
import type { ScenarioResult } from "./clarity-report-renderer.js";

/** 2-decimal precision to match Java's `%.2f` score formatting (cross-language contract). */
function round2(score: number): number {
  return Math.round(score * 100) / 100;
}

/**
 * Builds the Java-compatible scenario object: flat `overallScore`/`methodNameScore`/… keys,
 * 2-dp scores, upper-case severity, and issues with
 * `category`/`element`/`suggestion`/`severity`/`occurrences`/`impactScore`. Mirrors Java
 * `ClarityJsonExporter` so a Java-shaped consumer (Gradle plugin analog) parses it unchanged.
 */
function buildScenarioJson(name: string, result: ClarityResult) {
  return {
    name,
    overallScore: round2(result.overall),
    methodNameScore: round2(result.method),
    classNameScore: round2(result.class),
    parameterNameScore: round2(result.parameter),
    structuralScore: round2(result.structural),
    cohesionScore: round2(result.cohesion),
    issues: result.issues.map((i) => ({
      category: i.category,
      element: i.element,
      suggestion: i.suggestion,
      severity: i.severity,
      occurrences: i.occurrences,
      impactScore: round2(i.impactScore),
    })),
  };
}

export function exportClarityJson(result: ClarityResult, metadata: { scenario: string }): string {
  return JSON.stringify(
    { version: "1.0", scenarios: [buildScenarioJson(metadata.scenario, result)] },
    null,
    2,
  );
}

export function exportClarityJsonReport(results: readonly ScenarioResult[]): string {
  return JSON.stringify(
    {
      version: "1.0",
      scenarios: results.map((r) => buildScenarioJson(r.scenario, r.result)),
    },
    null,
    2,
  );
}
