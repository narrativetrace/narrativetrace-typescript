// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { type CommandOutcome, extractJsonObject, runCommand } from "./verify-all-exec.js";

interface BiomeDiagnostic {
  readonly category: string;
  readonly severity: string;
}

interface BiomeReport {
  readonly diagnostics: readonly BiomeDiagnostic[];
}

export interface BiomeSweep {
  readonly outcome: CommandOutcome;
  readonly lintFindings: number | undefined;
  readonly lintErrors: number | undefined;
  readonly formatFindings: number | undefined;
}

/**
 * `--reporter-file` writes an empty file in this Biome version (2.4.4) — confirmed directly
 * against a plain shell invocation, not just through this tool — and the JSON still comes out on
 * stdout regardless, ahead of an "unstable/experimental" warning line. So the report is parsed
 * straight from the captured output instead: the first line that looks like a JSON object.
 */
function parseReport(output: string): BiomeReport | undefined {
  const json = extractJsonObject(output);
  if (!json) return undefined;
  try {
    return JSON.parse(json) as BiomeReport;
  } catch {
    return undefined;
  }
}

function isLint(d: BiomeDiagnostic): boolean {
  return d.category.startsWith("lint/");
}

/**
 * `biome check`'s own real exit code only turns non-zero on an `"error"`-severity diagnostic —
 * this repo's `pnpm run lint` gate passes today with dozens of `warning`/`info` lint findings
 * outstanding (confirmed running this for real, not assumed). A `findings > 0` rule of my own
 * would have disagreed with the tool's own verdict on every real run this repo has ever had; the
 * `lintErrors` count is what actually determines the row's `status`, matching the real gate.
 */
export function runBiomeSweep(repoRoot: string, logDir: string): BiomeSweep {
  const outcome = runCommand(
    "pnpm",
    ["exec", "biome", "check", "--reporter=json", "."],
    join(logDir, "biome.log"),
    { cwd: repoRoot },
  );
  const report = parseReport(outcome.output);
  if (!report)
    return { outcome, lintFindings: undefined, lintErrors: undefined, formatFindings: undefined };
  const lint = report.diagnostics.filter(isLint);
  return {
    outcome,
    lintFindings: lint.length,
    lintErrors: lint.filter((d) => d.severity === "error").length,
    formatFindings: report.diagnostics.filter((d) => d.category === "format").length,
  };
}
