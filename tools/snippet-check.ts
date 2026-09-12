// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import {
  currentVersionBanner,
  extractRepoVersion,
  freshVersionCache,
  renderVersionBannerLine,
  stripCacheAgeComment,
} from "./llms-version-banner.js";
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
// `translation-check`, never touched here). The `llms.txt` banner check below follows the same
// rule: it reads the git-ignored registry cache `snippet-sync` last wrote, never the network
// itself — a stale/missing cache fails the same way an out-of-date banner text would.

interface Drift {
  readonly page: string;
  readonly markerLine: number;
  readonly path: string;
  readonly region: string | undefined;
}

function findSnippetDrifts(): Drift[] {
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
  return drifts;
}

function reportSnippetDrifts(drifts: readonly Drift[]): void {
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
}

function readRepoVersion(): string {
  return (JSON.parse(readFileSync("packages/core/package.json", "utf-8")) as { version: string })
    .version;
}

/**
 * `undefined` when the banner passes; otherwise a failure message. Two independent checks:
 * the repo-version half is always verified (deterministic, no network); the published-version
 * half is verified only when a fresh (<1h) registry cache already exists — an offline run (no
 * fresh cache) skips that half rather than failing on it, per the thin-CI/offline-nightly rule.
 */
function checkVersionBanner(): string | undefined {
  const repoVersion = readRepoVersion();
  const banner = currentVersionBanner(readFileSync("documentation/llms.txt", "utf-8"));
  if (banner === undefined) return "documentation/llms.txt has no version banner under its H1";

  const claimedRepoVersion = extractRepoVersion(banner);
  if (claimedRepoVersion !== repoVersion) {
    return (
      `documentation/llms.txt's banner names repo version '${claimedRepoVersion}' but ` +
      `packages/core/package.json is at '${repoVersion}'`
    );
  }

  const cached = freshVersionCache();
  if (!cached) return undefined; // offline: repo-version half already verified, stop here

  const expected = renderVersionBannerLine(repoVersion, cached.publishedVersion);
  if (stripCacheAgeComment(banner) !== expected) {
    return `documentation/llms.txt's banner is stale — expected '${expected}'`;
  }
  return undefined;
}

const drifts = findSnippetDrifts();
if (drifts.length > 0) {
  reportSnippetDrifts(drifts);
  process.exit(1);
}

const bannerFailure = checkVersionBanner();
if (bannerFailure !== undefined) {
  console.error(
    `snippet-check failed: ${bannerFailure}\n` + "  run `pnpm run snippet-sync` to regenerate it",
  );
  process.exit(1);
}

console.log("snippet-check: every embedded snippet matches its source");
