// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Turns a `vitest bench --outputJson` snapshot into a pass/fail regression gate.
 *
 * INTENT: `scripts/save-bench.sh` already runs the suite and saves a dated JSON snapshot
 * (`reports/benchmarks/YYYY-MM-DD-<sha>.json`) plus a `latest.json` pointer, but nothing ever
 * looked at the numbers — `vitest bench --compare` only prints a table, it never fails the
 * process. This is the missing threshold decision: compare the run just produced against the
 * previous `latest.json` baseline, on time (`mean`), and fail loud when a benchmark got slower
 * by more than the noise floor allows. Mirrors the family's own convention (.NET's
 * BenchmarkDotNet gate: >15%/time) closely enough to reason about across ports, loosened
 * slightly (20%) because this runs in a Docker-in-Docker dev container, not bare metal.
 *
 * Machine-readable output (`--out`) is a JSON verdict, not just a console table, so a nightly
 * runner or a future dashboard can consume it without re-parsing text.
 */

interface RawBenchmark {
  name: string;
  mean: number;
  rme: number;
}

interface RawGroup {
  fullName: string;
  benchmarks: RawBenchmark[];
}

interface RawFile {
  groups: RawGroup[];
}

interface RawReport {
  files: RawFile[];
}

interface FlatBenchmark {
  key: string;
  mean: number;
  rme: number;
}

interface BenchmarkVerdict {
  key: string;
  baselineMeanMs: number;
  currentMeanMs: number;
  deltaPercent: number;
  noiseFloorPercent: number;
  status: "ok" | "regression";
}

interface GateResult {
  generatedAt: string;
  baselineFile: string | null;
  currentFile: string;
  thresholdPercent: number;
  overall: "pass" | "fail" | "no-baseline";
  regressed: BenchmarkVerdict[];
  ok: BenchmarkVerdict[];
  newBenchmarks: string[];
  removedBenchmarks: string[];
}

const DEFAULT_THRESHOLD_PERCENT = 20;
/** A benchmark's own margin of error must not itself look like a regression. */
const NOISE_FLOOR_MULTIPLIER = 3;

function loadReport(path: string): Map<string, FlatBenchmark> {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as RawReport;
  const flat = new Map<string, FlatBenchmark>();
  for (const file of raw.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        const key = `${group.fullName} > ${bench.name}`;
        flat.set(key, { key, mean: bench.mean, rme: bench.rme });
      }
    }
  }
  return flat;
}

function verdictFor(
  baseline: FlatBenchmark,
  current: FlatBenchmark,
  thresholdPercent: number,
): BenchmarkVerdict {
  const deltaPercent = ((current.mean - baseline.mean) / baseline.mean) * 100;
  const noiseFloorPercent = NOISE_FLOOR_MULTIPLIER * Math.max(baseline.rme, current.rme);
  const effectiveThreshold = Math.max(thresholdPercent, noiseFloorPercent);
  const status = deltaPercent > effectiveThreshold ? "regression" : "ok";
  return {
    key: baseline.key,
    baselineMeanMs: baseline.mean,
    currentMeanMs: current.mean,
    deltaPercent,
    noiseFloorPercent,
    status,
  };
}

function compare(
  baseline: Map<string, FlatBenchmark>,
  current: Map<string, FlatBenchmark>,
  thresholdPercent: number,
): { verdicts: BenchmarkVerdict[]; added: string[]; removed: string[] } {
  const verdicts: BenchmarkVerdict[] = [];
  const added: string[] = [];
  for (const [key, currentBench] of current) {
    const baselineBench = baseline.get(key);
    if (!baselineBench) {
      added.push(key);
      continue;
    }
    verdicts.push(verdictFor(baselineBench, currentBench, thresholdPercent));
  }
  const removed = [...baseline.keys()].filter((key) => !current.has(key));
  return { verdicts, added, removed };
}

function printReport(result: GateResult): void {
  console.log(
    `\nBenchmark gate — threshold ${result.thresholdPercent}% (or 3x noise, whichever is larger)\n`,
  );
  for (const v of [...result.ok, ...result.regressed]) {
    const mark = v.status === "regression" ? "FAIL" : "ok  ";
    console.log(
      `  [${mark}] ${v.key}: ${v.baselineMeanMs.toFixed(4)}ms -> ${v.currentMeanMs.toFixed(4)}ms ` +
        `(${v.deltaPercent >= 0 ? "+" : ""}${v.deltaPercent.toFixed(1)}%, noise floor ${v.noiseFloorPercent.toFixed(1)}%)`,
    );
  }
  for (const key of result.newBenchmarks) console.log(`  [new ] ${key}: no baseline yet`);
  for (const key of result.removedBenchmarks) console.log(`  [gone] ${key}: no longer benchmarked`);
  console.log(`\nOverall: ${result.overall.toUpperCase()}\n`);
}

function parseArgs(argv: string[]): {
  current: string;
  baseline: string;
  out: string;
  thresholdPercent: number;
} {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const current = get("--current");
  const baseline = get("--baseline");
  const out = get("--out");
  if (!current || !baseline || !out) {
    throw new Error(
      "usage: bench-gate.ts --current <file> --baseline <file> --out <file> [--threshold <percent>]",
    );
  }
  const thresholdPercent = Number(get("--threshold") ?? DEFAULT_THRESHOLD_PERCENT);
  return { current, baseline, out, thresholdPercent };
}

function loadBaselineOrNull(path: string): Map<string, FlatBenchmark> | null {
  try {
    return loadReport(path);
  } catch {
    return null;
  }
}

function buildResult(
  args: ReturnType<typeof parseArgs>,
  baseline: Map<string, FlatBenchmark> | null,
  current: Map<string, FlatBenchmark>,
): GateResult {
  if (!baseline) {
    return {
      generatedAt: new Date().toISOString(),
      baselineFile: null,
      currentFile: args.current,
      thresholdPercent: args.thresholdPercent,
      overall: "no-baseline",
      regressed: [],
      ok: [],
      newBenchmarks: [...current.keys()],
      removedBenchmarks: [],
    };
  }
  const { verdicts, added, removed } = compare(baseline, current, args.thresholdPercent);
  const regressed = verdicts.filter((v) => v.status === "regression");
  return {
    generatedAt: new Date().toISOString(),
    baselineFile: args.baseline,
    currentFile: args.current,
    thresholdPercent: args.thresholdPercent,
    overall: regressed.length > 0 ? "fail" : "pass",
    regressed,
    ok: verdicts.filter((v) => v.status === "ok"),
    newBenchmarks: added,
    removedBenchmarks: removed,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const baseline = loadBaselineOrNull(args.baseline);
  const current = loadReport(args.current);
  const result = buildResult(args, baseline, current);
  writeFileSync(args.out, JSON.stringify(result, null, 2));
  printReport(result);
  if (result.overall === "no-baseline") {
    console.log(`No baseline at ${args.baseline} yet — nothing to compare against. Bootstrapping.`);
  }
  if (result.overall === "fail") process.exit(1);
}

main();
