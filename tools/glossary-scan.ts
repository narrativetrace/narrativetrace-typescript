// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseScanArgs, runGlossaryScan, type ScanIo } from "./glossary-scan-runner.js";

/** Test and declaration files describe the code; they do not name the domain. */
const SKIPPED = /(\.test\.ts|\.prop\.test\.ts|\.d\.ts)$/;

/** Directories a source scan never has vocabulary to find. */
const SKIPPED_DIRS = new Set(["node_modules", "dist", "coverage", ".stryker-tmp"]);

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !SKIPPED.test(entry.name) ? [path] : [];
  });
}

const io: ScanIo = {
  sourceFiles,
  readFile: (path) => readFileSync(path, "utf-8"),
  fileExists: existsSync,
  writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  log: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
};

const options = parseScanArgs(process.argv.slice(2));
if (options === undefined) {
  io.error("--source-dir is required");
  process.exit(1);
}
process.exit(runGlossaryScan(options, io));
