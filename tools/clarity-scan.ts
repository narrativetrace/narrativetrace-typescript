// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateClarityGate,
  exportClarityJsonReport,
  renderClarityReport,
  renderClaritySuiteReport,
  type ScenarioResult,
} from "../packages/clarity/src/index.js";
import { scanSource } from "./clarity-scan-analyzer.js";

type Format = "both" | "md" | "json";

interface ScanOptions {
  minScore?: number;
  maxHighIssues?: number;
  json: boolean;
  format?: Format;
  outputDir?: string;
  warnOnly: boolean;
}

function parseArgs(args: string[]): ScanOptions {
  const opts: ScanOptions = { json: false, warnOnly: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const inline = arg.match(/^(--[a-z-]+)=(.+)$/);
    const flag = inline ? (inline[1] as string) : arg;
    const value = inline ? (inline[2] as string) : args[i + 1];
    const consume = (): string => {
      if (inline) return value as string;
      i++;
      return value as string;
    };
    switch (flag) {
      case "--min-score":
        opts.minScore = Number.parseFloat(consume());
        break;
      case "--max-high-issues":
        opts.maxHighIssues = Number.parseInt(consume(), 10);
        break;
      case "--json":
        opts.json = true;
        break;
      case "--warn-only":
        opts.warnOnly = true;
        break;
      case "--output-dir":
        opts.outputDir = consume();
        break;
      case "--format": {
        const f = consume();
        if (f !== "both" && f !== "md" && f !== "json") {
          console.error(`Unknown format: ${f} (expected: both, md, or json)`);
          process.exit(2);
        }
        opts.format = f;
        break;
      }
      default:
        break;
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const files = execSync(
  "find packages/*/src -name '*.ts' -not -name '*.test.ts' -not -name '*.prop.test.ts' -not -name '*.d.ts'",
  { encoding: "utf-8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const allResults: ScenarioResult[] = [];
for (const file of files) {
  const source = readFileSync(file, "utf-8");
  for (const cr of scanSource(source, file)) {
    allResults.push({ scenario: `${file}:${cr.className}`, result: cr.result });
  }
}

// When an --output-dir is given, write the Java-parity suite artifacts; otherwise print to stdout.
if (opts.outputDir) {
  const format = opts.format ?? "both";
  mkdirSync(opts.outputDir, { recursive: true });
  if (format === "both" || format === "md") {
    writeFileSync(join(opts.outputDir, "clarity-report.md"), renderClaritySuiteReport(allResults));
  }
  if (format === "both" || format === "json") {
    writeFileSync(
      join(opts.outputDir, "clarity-results.json"),
      exportClarityJsonReport(allResults),
    );
  }
  console.log(`Clarity scan complete: ${allResults.length} class(es) → ${opts.outputDir}`);
} else if (opts.json) {
  console.log(exportClarityJsonReport(allResults));
} else {
  console.log(renderClarityReport(allResults));
}

const violations = evaluateClarityGate(allResults, {
  minScore: opts.minScore,
  maxHighIssues: opts.maxHighIssues,
});
if (violations.length > 0) {
  const label = opts.warnOnly ? "warning" : "Clarity gate failure";
  for (const v of violations) console.error(`${label}: ${v}`);
  if (!opts.warnOnly) process.exit(1);
}
