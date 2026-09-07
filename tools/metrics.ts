// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { analyzeFile, type FunctionMetric } from "./analyze.js";

function parseArgs(args: string[]): { maxLines: number; top: number } {
  let maxLines = 20;
  let top = 15;
  for (const arg of args) {
    const maxMatch = arg.match(/^--max-lines=(\d+)$/);
    if (maxMatch?.[1]) {
      maxLines = Number.parseInt(maxMatch[1], 10);
    }
    const topMatch = arg.match(/^--top=(\d+)$/);
    if (topMatch?.[1]) {
      top = Number.parseInt(topMatch[1], 10);
    }
  }
  return { maxLines, top };
}

const { maxLines, top } = parseArgs(process.argv.slice(2));

const files = execSync(
  "find packages/*/src -name '*.ts' -not -name '*.test.ts' -not -name '*.prop.test.ts'",
  { encoding: "utf-8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const allMetrics: FunctionMetric[] = [];

for (const file of files) {
  const source = readFileSync(file, "utf-8");
  const metrics = analyzeFile(source, file);
  allMetrics.push(...metrics);
}

allMetrics.sort((a, b) => b.lines - a.lines);

const topN = allMetrics.slice(0, top);

if (topN.length > 0) {
  console.log(`\nTop ${topN.length} longest functions/methods:\n`);
  console.log(`${"Rank".padEnd(6)}${"Lines".padEnd(8)}${"Name".padEnd(30)}Location`);
  console.log("-".repeat(80));

  for (const [i, m] of topN.entries()) {
    const rank = `#${i + 1}`.padEnd(6);
    const lines = String(m.lines).padEnd(8);
    const name = m.name.length > 28 ? `${m.name.slice(0, 25)}...` : m.name.padEnd(30);
    const location = `${m.file}:${m.line}`;
    console.log(`${rank}${lines}${name}${location}`);
  }
  console.log();
}

const violations = allMetrics.filter((m) => m.lines > maxLines);

if (violations.length > 0) {
  console.error(`\n${violations.length} function(s) exceed ${maxLines}-line limit:\n`);
  for (const v of violations) {
    console.error(`  ${v.name} (${v.lines} lines) at ${v.file}:${v.line}`);
  }
  console.error();
  process.exit(1);
} else {
  console.log(`All functions are within the ${maxLines}-line limit.`);
}
