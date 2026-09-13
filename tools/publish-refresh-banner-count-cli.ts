// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyVersionBanner,
  countUnreleasedMarkers,
  currentVersionBanner,
  refreshUnreleasedClauseInBanner,
} from "./llms-version-banner.js";

// CLI entry the publish pipeline's `--tag` transform shells out to, immediately after the
// since-marker rewrite: recomputes `documentation/llms.txt`'s unreleased-marker count against the
// STAGED snapshot (post-rewrite, so it reflects exactly what survived) and rewrites just that
// clause in place — the TypeScript counter, not a shell mirror. Left undone, the banner's count
// would go stale by exactly the number the rewrite step just stripped, and `snippet-check`'s
// deterministic count check would fail on the very snapshot this script is supposed to leave
// clean. Prints the refreshed count; a stage with no `documentation/llms.txt` or no banner line
// yet is a no-op, not a failure — not every staged snapshot carries one.

const [, , root] = process.argv;
if (!root) {
  console.error("usage: tsx publish-refresh-banner-count-cli.ts <stageRoot>");
  process.exit(1);
}

const llmsPath = join(root, "documentation/llms.txt");
let text: string;
try {
  text = readFileSync(llmsPath, "utf-8");
} catch {
  process.exit(0);
}

const banner = currentVersionBanner(text);
if (banner === undefined) {
  process.exit(0);
}

const count = countUnreleasedMarkers(root);
const updated = refreshUnreleasedClauseInBanner(banner, count);
if (updated !== banner) {
  writeFileSync(llmsPath, applyVersionBanner(text, updated), "utf-8");
}
console.log(count);
