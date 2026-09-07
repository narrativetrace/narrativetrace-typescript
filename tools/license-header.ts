// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { hasInTreeHeader, stripInTreeHeader } from "./license-header-analyzer.js";

// The runtime is published under BSL 1.1 (see LICENSE); the publish pipeline
// stamps that header onto the public snapshot at publish time. In-tree sources carry no
// header at all, so this gate is the inverse of the one it replaces: it fails on a header, not on a
// missing one. A committed header is a licensing statement that no relicensing decision
// can reliably reach — 356 files claimed Apache 2.0 the day the runtime stopped being it.

const SOURCE_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs"];

function findFiles(): string[] {
  const globs = SOURCE_GLOBS.map((glob) => `'${glob}'`).join(" ");
  return execSync(`git ls-files ${globs}`, { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 })
    .trim()
    .split("\n")
    .filter(Boolean);
}

function stripHeader(filePath: string): boolean {
  const content = readFileSync(filePath, "utf-8");
  const stripped = stripInTreeHeader(content);
  if (stripped === content) return false;
  writeFileSync(filePath, stripped);
  return true;
}

function checkAll(files: string[]): number {
  // Fill-aware, because this check ships inside the public snapshot, where
  // every source file IS stamped by design. Which tree this is comes from
  // LICENSE itself: the private template carries {{VERSION}}/{{CHANGE_DATE}};
  // a published tree carries them filled. Private: headers must be absent.
  // Published: headers must be PRESENT. Partial stamping fails either way.
  const published = !readFileSync("LICENSE", "utf-8").includes("{{");
  const offenders = files.filter(
    (file) => hasInTreeHeader(readFileSync(file, "utf-8")) !== published,
  );
  for (const file of offenders)
    console.error(
      published
        ? `Missing license header in published tree: ${file}`
        : `In-tree license header: ${file}`,
    );
  return offenders.length;
}

function fixAll(files: string[]): number {
  let stripped = 0;
  for (const file of files) {
    if (stripHeader(file)) {
      console.log(`Stripped header: ${file}`);
      stripped++;
    }
  }
  return stripped;
}

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--fix") {
  console.error("Usage: tsx tools/license-header.ts --check|--fix");
  process.exit(1);
}

const files = findFiles();

if (mode === "--check") {
  const offenders = checkAll(files);
  if (offenders > 0) {
    console.error(
      `\n${offenders} file(s) carry an in-tree license header. The header is stamped at publish time only — run: pnpm run license-fix`,
    );
    process.exit(1);
  }
} else {
  const stripped = fixAll(files);
  console.log(
    stripped > 0 ? `\nStripped headers from ${stripped} file(s).` : "No in-tree headers.",
  );
}
