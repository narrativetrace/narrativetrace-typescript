// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";
import { expectedPlatformTableFiles } from "./platform-table-render.js";

// Per-commit gate (wired into `pnpm run check`): the platform table's one surface — the table block
// of documentation/use-with-your-agent.md — is BUILD OUTPUT of
// packages/tooling/src/platforms/platform-table.ts. Same --check/--fix pair as
// tools/framework-table-render-cli.ts: --check fails naming each drifted file (and never writes),
// --fix writes them.

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--fix") {
  console.error("Usage: tsx tools/platform-table-render-cli.ts --check|--fix");
  process.exit(1);
}

const expected = expectedPlatformTableFiles();
if (mode === "--check") {
  const drifted = [...expected].filter(([path, text]) => readFileSync(path, "utf-8") !== text);
  if (drifted.length > 0) {
    for (const [path] of drifted) console.error(`${path} does not match the platform table.`);
    console.error("Run `pnpm run platform-table-render` to regenerate it.");
    process.exit(1);
  }
  console.log("platform-table-check: use-with-your-agent.md matches the platform table");
} else {
  for (const [path, text] of expected) writeFileSync(path, text);
  console.log(`wrote ${[...expected.keys()].join(", ")}`);
}
