// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SKILLS } from "@narrativetrace/skills";
import { parseRunsJsonl, renderPromotionMarkdown } from "./promotion-render.js";

// Per-commit gate (wired into `pnpm run check`, after `pnpm run build` so @narrativetrace/skills'
// dist exists): ledger/promotion.md is BUILD OUTPUT of ledger/runs.jsonl plus the typed skill
// catalogue — never hand-edited. Mirrors tools/skills-render.ts's --check/--fix pair: --check
// fails naming what drifted (run `pnpm run promotion-render` to fix it); --fix writes it.

const RUNS_PATH = "packages/skills/ledger/runs.jsonl";
const PROMOTION_PATH = "packages/skills/ledger/promotion.md";

function expectedPromotionMarkdown(): string {
  const runsContent = existsSync(RUNS_PATH) ? readFileSync(RUNS_PATH, "utf-8") : "";
  return renderPromotionMarkdown(SKILLS, parseRunsJsonl(runsContent));
}

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--fix") {
  console.error("Usage: tsx tools/promotion-render-cli.ts --check|--fix");
  process.exit(1);
}

const expected = expectedPromotionMarkdown();
if (mode === "--check") {
  const actual = existsSync(PROMOTION_PATH) ? readFileSync(PROMOTION_PATH, "utf-8") : undefined;
  if (actual !== expected) {
    console.error(
      `${PROMOTION_PATH} does not match ledger/runs.jsonl + the typed skill catalogue.\n` +
        "Run `pnpm run promotion-render` to regenerate it.",
    );
    process.exit(1);
  }
  console.log("promotion-render: ledger/promotion.md matches ledger/runs.jsonl");
} else {
  writeFileSync(PROMOTION_PATH, expected);
  console.log(`wrote ${PROMOTION_PATH}`);
}
