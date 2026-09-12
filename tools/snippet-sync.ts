// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";
import {
  applyVersionBanner,
  renderVersionBannerLine,
  resolvePublishedVersion,
  withCacheAgeComment,
} from "./llms-version-banner.js";
import { englishDocPages, parseSnippetBlocks, resolveSnippetSource } from "./snippet-shared.js";

// Rewrites every fenced snippet block, in place, to match its source — English pages only
// (mirrors are never touched: `translation-check` flags their code-block drift, and the fix is
// the translator restamping after this runs on the English page). Unlike `snippet-check`, sync
// writes the source's real, unmasked content — the page ends up carrying whatever duration the
// source has right now, same as any other approval-artifact sync.
//
// Also regenerates `llms.txt`'s "docs vs published" banner line (docs-vs-published-gate design
// note, part (a)): the one step in this repo's build that is allowed to touch the registry.

function syncSnippetBlocks(): { changedBlocks: number; changedPages: number } {
  let changedBlocks = 0;
  const changedPages = new Set<string>();

  for (const page of englishDocPages()) {
    const text = readFileSync(page, "utf-8");
    const lines = text.split("\n");
    const blocks = parseSnippetBlocks(page, text);

    // Rewritten back to front so an earlier block's line numbers never shift out from under a
    // later one still to be processed.
    for (const block of [...blocks].reverse()) {
      const actual = resolveSnippetSource(block);
      const actualLines = actual === "" ? [] : actual.split("\n");
      const current = block.contentLines.join("\n");
      if (current === actual) continue;
      lines.splice(block.contentStart, block.contentEnd - block.contentStart, ...actualLines);
      changedBlocks++;
      changedPages.add(page);
      console.log(`snippet-sync: ${page}:${block.markerLine} updated from ${block.path}`);
    }

    if (changedPages.has(page)) writeFileSync(page, lines.join("\n"), "utf-8");
  }

  return { changedBlocks, changedPages: changedPages.size };
}

async function syncVersionBanner(): Promise<void> {
  const repoVersion = (
    JSON.parse(readFileSync("packages/core/package.json", "utf-8")) as { version: string }
  ).version;
  const { publishedVersion, asOfMs } = await resolvePublishedVersion({
    packageName: "@narrativetrace/core",
    nowMs: Date.now(),
  });
  const bannerLine = withCacheAgeComment(
    renderVersionBannerLine(repoVersion, publishedVersion),
    asOfMs,
  );
  const path = "documentation/llms.txt";
  const before = readFileSync(path, "utf-8");
  const after = applyVersionBanner(before, bannerLine);
  if (before !== after) {
    writeFileSync(path, after, "utf-8");
    console.log(`snippet-sync: llms.txt banner updated — ${bannerLine}`);
  } else {
    console.log(`snippet-sync: llms.txt banner already current — ${bannerLine}`);
  }
}

async function main(): Promise<void> {
  const { changedBlocks, changedPages } = syncSnippetBlocks();
  console.log(
    changedBlocks === 0
      ? "snippet-sync: no blocks needed updating"
      : `snippet-sync: updated ${changedBlocks} block(s) across ${changedPages} page(s)`,
  );
  await syncVersionBanner();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
