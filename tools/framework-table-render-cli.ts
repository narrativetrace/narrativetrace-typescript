// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";
import { expectedFrameworkTableFiles } from "./framework-table-render.js";

// Per-commit gate (wired into `pnpm run check`): the framework table's three surfaces — the
// snippet carrier the doctor bundles, llms-full.md's table block, llms.txt's covered-frameworks
// line — are BUILD OUTPUT of packages/tooling/src/frameworks/framework-table.ts and the compiled
// wiring fixtures it names. Same --check/--fix pair as tools/context-reference-render-cli.ts:
// --check fails naming each drifted file (and never writes), --fix writes them.

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--fix") {
  console.error("Usage: tsx tools/framework-table-render-cli.ts --check|--fix");
  process.exit(1);
}

const expected = expectedFrameworkTableFiles();
if (mode === "--check") {
  const drifted = [...expected].filter(([path, text]) => readFileSync(path, "utf-8") !== text);
  if (drifted.length > 0) {
    for (const [path] of drifted) console.error(`${path} does not match the framework table.`);
    console.error("Run `pnpm run framework-table-render` to regenerate it.");
    process.exit(1);
  }
  console.log("framework-table-check: the carrier, llms-full.md and llms.txt match the table");
} else {
  for (const [path, text] of expected) writeFileSync(path, text);
  console.log(`wrote ${[...expected.keys()].join(", ")}`);
}
