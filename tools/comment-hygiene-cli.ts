// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lint } from "./comment-hygiene.js";

// CLI entry `check` runs every commit, no network: fails on any `owner ruling`/`ruled 20YY-...`/
// `(20YY-MM-DD)`/`, unreleased)` history left in a `packages/*/src` comment (see
// comment-hygiene.ts's own doc for why), excusing only the files named in
// comment-hygiene-allowlist.json — each with a reason. Also fails on a stale allowlist entry (a
// file the allowlist excuses that no longer has any hit): the allowlist is meant to shrink, one
// package's wave at a time, never to accumulate entries nobody has to remove.

const REPO_ROOT = process.cwd();
const ALLOWLIST_PATH = "tools/comment-hygiene-allowlist.json";

const allowlistJson = JSON.parse(readFileSync(join(REPO_ROOT, ALLOWLIST_PATH), "utf-8")) as Record<
  string,
  string
>;
const allowlist = new Map(Object.entries(allowlistJson));

const { violations, staleAllowlistEntries } = lint(REPO_ROOT, allowlist);

if (violations.length > 0) {
  console.error(
    `comment-hygiene: ${violations.length} history reference(s) left in code comments:`,
  );
  for (const hit of violations) console.error(`  ${hit.file}:${hit.line}: ${hit.text}`);
  console.error(`  (add a reason to ${ALLOWLIST_PATH} only for a package not yet swept)`);
  process.exit(1);
}
if (staleAllowlistEntries.length > 0) {
  console.error(
    `comment-hygiene: ${staleAllowlistEntries.length} stale allowlist entry(ies) — no hit left, remove from ${ALLOWLIST_PATH}:`,
  );
  for (const file of staleAllowlistEntries) console.error(`  ${file}`);
  process.exit(1);
}
console.log(
  `comment-hygiene: packages/*/src is clean (${allowlist.size} package(s) still allowlisted, pending their own wave)`,
);
