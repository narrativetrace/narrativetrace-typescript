// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/recipe-runs.ts
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** One test of a nested run, as Vitest's JSON reporter reports it. */
export interface FixtureTestResult {
  readonly title: string;
  readonly status: string;
  readonly failureMessages: readonly string[];
}

/** How a nested run differs from the default: `NARRATIVETRACE_*` settings, and a test-name regex. */
export interface FixtureOptions {
  readonly settings?: Record<string, string>;
  readonly testPattern?: string;
}

/** What a nested Vitest process did: its exit code and each test's verdict. */
export interface FixtureRun {
  readonly exitCode: number;
  readonly tests: readonly FixtureTestResult[];
}

interface JsonReport {
  readonly testResults: readonly {
    readonly assertionResults: readonly {
      readonly title: string;
      readonly status: string;
      readonly failureMessages: readonly string[];
    }[];
  }[];
}

const FIXTURE_CONFIG = join("fixtures", "vitest.config.ts");

/** Where every recipe page's evidence is written — gitignored build output, never the source tree. */
export function recipeOutput(slug: string, ...rest: string[]): string {
  return join("narrativetrace-output", "recipes", slug, ...rest);
}

/** The parent's environment minus anything that would make the nested run inherit its settings. */
function cleanEnvironment(): Record<string, string> {
  const kept = Object.entries(process.env).filter(
    ([key, value]) =>
      value !== undefined && !key.startsWith("VITEST") && !key.startsWith("NARRATIVETRACE_"),
  );
  return Object.fromEntries(kept) as Record<string, string>;
}

function vitestArguments(fixture: string, reportFile: string, testPattern?: string): string[] {
  const common = ["--config", FIXTURE_CONFIG, "--reporter=json", `--outputFile=${reportFile}`];
  return [...common, ...(testPattern ? ["-t", testPattern] : []), fixture];
}

/**
 * Runs one fixture file in a nested, real Vitest process — the way a developer runs a test — with
 * its trace output in `outputDir` and `options.settings` as the `NARRATIVETRACE_*` environment.
 *
 * INTENT: a recipe page's evidence is what a real run wrote, and a failing run is a real failing
 * run driven by the test runner, so the fixture is never imported and asserted on in-process.
 */
export function runFixture(
  fixture: string,
  outputDir: string,
  options: FixtureOptions = {},
): FixtureRun {
  const reportFile = join(outputDir, "vitest-report.json");
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  const vitest = createRequire(import.meta.url).resolve("vitest/vitest.mjs");
  const run = spawnSync(
    process.execPath,
    [vitest, "run", ...vitestArguments(fixture, reportFile, options.testPattern)],
    {
      encoding: "utf-8",
      env: { ...cleanEnvironment(), NARRATIVETRACE_OUTPUT_DIR: outputDir, ...options.settings },
    },
  );
  const report = JSON.parse(readFileSync(reportFile, "utf-8")) as JsonReport;
  const tests = report.testResults.flatMap((file) => file.assertionResults);
  return { exitCode: run.status ?? -1, tests };
}

/**
 * Copies the narrative a run wrote — the Markdown artifact — to `destination` without its
 * frontmatter, which carries the run's name, a fresh trace id and a wall-clock duration that differ
 * on every run. What remains is the call flow itself, the part a page reads.
 */
export function writeNarrativeBody(artifact: string, destination: string): string {
  const body = readFileSync(artifact, "utf-8").replace(/^---\n[\s\S]*?\n---\n\n/, "");
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${body.trimEnd()}\n`, "utf-8");
  return body;
}
