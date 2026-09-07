// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface MutantResult {
  id: string;
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: { line: number; column: number } };
}

interface MutationFile {
  mutants: MutantResult[];
}

interface MutationReport {
  files: Record<string, MutationFile>;
}

interface Survivor {
  pkg: string;
  file: string;
  line: number;
  mutator: string;
  replacement: string;
}

function findReports(): { pkg: string; path: string }[] {
  const packagesDir = "packages";
  const results: { pkg: string; path: string }[] = [];
  for (const pkg of readdirSync(packagesDir)) {
    const reportPath = join(packagesDir, pkg, "reports", "mutation", "mutation.json");
    if (existsSync(reportPath)) {
      results.push({ pkg, path: reportPath });
    }
  }
  return results;
}

function parseSurvivors(pkg: string, reportPath: string): Survivor[] {
  const data: MutationReport = JSON.parse(readFileSync(reportPath, "utf-8"));
  const survivors: Survivor[] = [];
  for (const [file, info] of Object.entries(data.files)) {
    for (const m of info.mutants) {
      if (m.status === "Survived" || m.status === "NoCoverage") {
        survivors.push({
          pkg,
          file,
          line: m.location.start.line,
          mutator: m.mutatorName,
          replacement: (m.replacement ?? "").slice(0, 60),
        });
      }
    }
  }
  return survivors;
}

const reports = findReports();
if (reports.length === 0) {
  console.log("No mutation reports found. Run `pnpm run mutate` first.");
  console.log("Reports expected at: packages/<pkg>/reports/mutation/mutation.json");
  process.exit(0);
}

const allSurvivors: Survivor[] = [];
for (const { pkg, path } of reports) {
  allSurvivors.push(...parseSurvivors(pkg, path));
}
allSurvivors.sort(
  (a, b) => a.pkg.localeCompare(b.pkg) || a.file.localeCompare(b.file) || a.line - b.line,
);

if (allSurvivors.length === 0) {
  console.log("All mutants killed across %d package(s).", reports.length);
  process.exit(0);
}

// Node's console.log understands %s/%d but not printf width flags such as %-14s, which it prints
// verbatim — columns are padded here instead.
function columns(pkg: string, file: string, line: string, mutator: string, replacement: string) {
  return `${pkg.padEnd(14)} ${file.padEnd(45)} ${line.padStart(5)}  ${mutator.padEnd(20)} ${replacement}`;
}

const limit = Number.parseInt(process.argv[2] ?? "30", 10);
console.log("Surviving mutants (%d total):\n", allSurvivors.length);
console.log(columns("Package", "File", "Line", "Mutator", "Replacement"));
console.log("-".repeat(110));
for (const s of allSurvivors.slice(0, limit)) {
  console.log(columns(s.pkg, s.file, String(s.line), s.mutator, s.replacement));
}
if (allSurvivors.length > limit) {
  console.log(
    "\n... and %d more (pass a number argument to show more)",
    allSurvivors.length - limit,
  );
}

const byPkg = new Map<string, number>();
for (const s of allSurvivors) {
  byPkg.set(s.pkg, (byPkg.get(s.pkg) ?? 0) + 1);
}
console.log("\nBy package:");
for (const [pkg, count] of [...byPkg.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pkg.padEnd(20)} ${count} survivors`);
}
