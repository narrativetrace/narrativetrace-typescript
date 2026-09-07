// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseTranslateArgs,
  runTranslateTraces,
  type TranslateIo,
} from "./translate-traces-runner.js";

/** Test and declaration files describe the code; they do not name the domain. */
const SKIPPED_SOURCE = /(\.test\.ts|\.prop\.test\.ts|\.d\.ts)$/;

/** Directories neither a trace tree nor a source scan has anything to find in. */
const SKIPPED_DIRS = new Set(["node_modules", "dist", "coverage", ".stryker-tmp", "diagrams"]);

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : filesUnder(path, keep);
    return keep(entry.name) ? [path] : [];
  });
}

const io: TranslateIo = {
  traceFiles: (dir) => filesUnder(dir, (name) => name.endsWith(".json")),
  sourceFiles: (dir) =>
    filesUnder(dir, (name) => name.endsWith(".ts") && !SKIPPED_SOURCE.test(name)),
  readFile: (path) => readFileSync(path, "utf-8"),
  fileExists: existsSync,
  writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  log: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
};

const options = parseTranslateArgs(process.argv.slice(2));
if (options === undefined) {
  io.error("--locale is required, e.g. --locale es or --locale es,de");
  process.exit(1);
}
process.exit(runTranslateTraces(options, io));
