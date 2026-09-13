// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";
import {
  CONTEXT_REFERENCE_PAGE,
  expectedContextReferencePage,
} from "./context-reference-render.js";

// Per-commit gate (wired into `pnpm run check`, after `pnpm run build`): the
// "SyncNarrativeContext — full member reference" table in documentation/llms-full.md is BUILD
// OUTPUT of packages/core/src/context.ts's own public surface — never hand-edited. Mirrors
// tools/skills-render.ts / tools/promotion-render-cli.ts's --check/--fix pair: --check fails
// naming what drifted (run `pnpm run context-reference-render` to fix it); --fix writes it.

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--fix") {
  console.error("Usage: tsx tools/context-reference-render-cli.ts --check|--fix");
  process.exit(1);
}

const expected = expectedContextReferencePage();
if (mode === "--check") {
  const actual = readFileSync(CONTEXT_REFERENCE_PAGE, "utf-8");
  if (actual !== expected) {
    console.error(
      `${CONTEXT_REFERENCE_PAGE}'s SyncNarrativeContext member reference does not match ` +
        "packages/core/src/context.ts.\nRun `pnpm run context-reference-render` to regenerate it.",
    );
    process.exit(1);
  }
  console.log(
    `context-reference-render: ${CONTEXT_REFERENCE_PAGE}'s member reference matches packages/core/src/context.ts`,
  );
} else {
  writeFileSync(CONTEXT_REFERENCE_PAGE, expected);
  console.log(`wrote ${CONTEXT_REFERENCE_PAGE}`);
}
