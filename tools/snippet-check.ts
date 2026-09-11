// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import {
  applyMask,
  englishDocPages,
  parseSnippetBlocks,
  resolveSnippetSource,
} from "./snippet-shared.js";

// Per-commit gate (wired into `pnpm run check`, after `pnpm run coverage`: the sixty-seconds
// example's one test has to have already run and written its output artifact for the page's
// output-block snippet to have anything to compare against). No network, no registry access — it
// only reads files already on disk, English pages only (mirrors are compared by
// `translation-check`, never touched here).

interface Drift {
  readonly page: string;
  readonly markerLine: number;
  readonly path: string;
  readonly region: string | undefined;
}

const drifts: Drift[] = [];

for (const page of englishDocPages()) {
  const text = readFileSync(page, "utf-8");
  for (const block of parseSnippetBlocks(page, text)) {
    const embedded = applyMask(block.contentLines.join("\n"), block.mask);
    const actual = applyMask(resolveSnippetSource(block), block.mask);
    if (embedded !== actual) {
      drifts.push({
        page: block.page,
        markerLine: block.markerLine,
        path: block.path,
        region: block.region,
      });
    }
  }
}

if (drifts.length > 0) {
  const first = drifts[0] as Drift;
  console.error(
    `snippet-check failed: ${first.page}:${first.markerLine} no longer matches its source\n` +
      `  page:   ${first.page}\n` +
      `  source: ${first.path}${first.region ? ` (region=${first.region})` : ""}\n` +
      "  run `pnpm run snippet-sync` if the source is right, or fix the source if the page is right",
  );
  if (drifts.length > 1) {
    console.error(`\n${drifts.length - 1} more drifted block(s):`);
    for (const d of drifts.slice(1)) {
      console.error(
        `  ${d.page}:${d.markerLine} — ${d.path}${d.region ? ` (region=${d.region})` : ""}`,
      );
    }
  }
  process.exit(1);
}

console.log("snippet-check: every embedded snippet matches its source");
