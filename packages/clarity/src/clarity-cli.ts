// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClarityResult } from "./clarity-analyzer.js";
import { evaluateClarityGate } from "./clarity-gate.js";
import { renderClaritySuiteReport, type ScenarioResult } from "./clarity-report-renderer.js";

/**
 * The clarity CLI operates on the accumulated `clarity-results.json` (Java's flat suite shape)
 * that the vitest runtime aggregation writes — TS has no bytecode to scan, so the results file is
 * the input, not compiled classes. It re-renders artifacts and enforces a build gate.
 */
export type ClarityFormat = "both" | "md" | "json";

export type ClarityCliOptions = {
  readonly format: ClarityFormat;
  readonly outputDir: string;
  readonly input: string;
  readonly maxHighIssues?: number | undefined;
  readonly minScore?: number | undefined;
  readonly warnOnly: boolean;
};

/** Injected IO so the CLI logic is testable without touching the real filesystem. */
export type CliDeps = {
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  mkdir: (dir: string) => void;
  log: (message: string) => void;
  error: (message: string) => void;
};

class UsageError extends Error {
  readonly exitCode = 2;
}

type IssueJson = {
  category: string;
  element: string;
  suggestion: string;
  severity: ClarityResult["issues"][number]["severity"];
  occurrences: number;
  impactScore: number;
};

type ScenarioJson = {
  name: string;
  overallScore: number;
  methodNameScore: number;
  classNameScore: number;
  parameterNameScore: number;
  structuralScore: number;
  cohesionScore: number;
  issues: IssueJson[];
};

type ClarityReportJson = { version: string; scenarios: ScenarioJson[] };

function nextValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined) throw new UsageError(`Missing value for ${flag}`);
  return value;
}

function parseFormat(value: string): ClarityFormat {
  if (value !== "both" && value !== "md" && value !== "json") {
    throw new UsageError(`Unknown format: ${value} (expected: both, md, or json)`);
  }
  return value;
}

/**
 * Options under construction — mutable, unlike {@link ClarityCliOptions}, and `input` stays open
 * because it defaults from `outputDir` only once every flag has been seen.
 */
type ArgDraft = {
  format: ClarityFormat;
  outputDir: string;
  input?: string;
  maxHighIssues?: number;
  minScore?: number;
  warnOnly: boolean;
};

/** Flags that consume the following argv entry, keyed by flag name. */
const VALUE_FLAGS: Record<string, (draft: ArgDraft, value: string) => void> = {
  "--format": (d, v) => {
    d.format = parseFormat(v);
  },
  "--output-dir": (d, v) => {
    d.outputDir = v;
  },
  "--input": (d, v) => {
    d.input = v;
  },
  "--max-high-issues": (d, v) => {
    d.maxHighIssues = Number.parseInt(v, 10);
  },
  "--min-score": (d, v) => {
    d.minScore = Number.parseFloat(v);
  },
};

/** Parses argv into options; throws a UsageError (exit code 2) for unknown formats or bad values. */
export function parseClarityArgs(argv: string[]): ClarityCliOptions {
  const draft: ArgDraft = { format: "both", outputDir: ".", warnOnly: false };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    if (flag === "--warn-only") {
      draft.warnOnly = true;
      continue;
    }
    const apply = VALUE_FLAGS[flag];
    if (!apply) throw new UsageError(`Unknown argument: ${flag}`);
    apply(draft, nextValue(argv, i++, flag));
  }

  return { ...draft, input: draft.input ?? `${draft.outputDir}/clarity-results.json` };
}

function toScenarioResult(scenario: ScenarioJson): ScenarioResult {
  return {
    scenario: scenario.name,
    result: {
      overall: scenario.overallScore,
      method: scenario.methodNameScore,
      class: scenario.classNameScore,
      parameter: scenario.parameterNameScore,
      structural: scenario.structuralScore,
      cohesion: scenario.cohesionScore,
      issues: scenario.issues,
    },
  };
}

/**
 * Runs the clarity gate over an accumulated results file: re-renders the requested artifacts and
 * enforces `--max-high-issues` / `--min-score` thresholds. Returns the process exit code — 0 pass,
 * 1 gate failure or IO error, 2 usage error (unknown format/argument).
 */
export function runClarityCli(argv: string[], deps: CliDeps): number {
  let opts: ClarityCliOptions;
  try {
    opts = parseClarityArgs(argv);
  } catch (e) {
    deps.error((e as Error).message);
    return (e as UsageError).exitCode ?? 2;
  }

  let report: ClarityReportJson;
  try {
    report = JSON.parse(deps.readFile(opts.input)) as ClarityReportJson;
  } catch (e) {
    deps.error(`Failed to read clarity results from ${opts.input}: ${(e as Error).message}`);
    return 1;
  }

  writeArtifacts(report, opts, deps);
  return gateExitCode(report, opts, deps);
}

/** Re-renders the requested artifacts into `outputDir`. */
function writeArtifacts(report: ClarityReportJson, opts: ClarityCliOptions, deps: CliDeps): void {
  deps.mkdir(opts.outputDir);
  if (opts.format === "both" || opts.format === "md") {
    const md = renderClaritySuiteReport(report.scenarios.map(toScenarioResult));
    deps.writeFile(`${opts.outputDir}/clarity-report.md`, md);
  }
  if (opts.format === "both" || opts.format === "json") {
    deps.writeFile(`${opts.outputDir}/clarity-results.json`, JSON.stringify(report, null, 2));
  }
}

/** Applies the thresholds and reports the outcome; `warnOnly` downgrades failures to warnings. */
function gateExitCode(report: ClarityReportJson, opts: ClarityCliOptions, deps: CliDeps): number {
  const violations = evaluateClarityGate(report.scenarios.map(toScenarioResult), {
    minScore: opts.minScore,
    maxHighIssues: opts.maxHighIssues,
  });
  if (violations.length === 0) {
    deps.log(`Clarity gate passed: ${report.scenarios.length} scenario(s)`);
    return 0;
  }
  if (opts.warnOnly) {
    for (const v of violations) deps.log(`warning: ${v}`);
    return 0;
  }
  for (const v of violations) deps.error(`Clarity gate failure: ${v}`);
  return 1;
}
