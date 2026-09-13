// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { findStaleSinceMarkers } from "./publish-since-markers.js";

// CLI entry the publish pipeline's `--tag` transform shells out to: the "no stale
// 'unreleased' marker survives" gate, whole-file and whitespace-tolerant (see
// publish-since-markers.ts) — a line-based grep cannot see a marker wrapped across a Markdown
// hard-wrap, the same gap the rewrite step has to tolerate. Prints one "path:line: since X" hit
// per line; the bash caller treats any output at all as a failure. Always exits 0 — reporting
// what it found is this script's whole job, not deciding whether that is fatal.

const [, , root, version] = process.argv;
if (!root || !version) {
  console.error("usage: tsx publish-stale-marker-gate-cli.ts <stageRoot> <version>");
  process.exit(1);
}

for (const hit of findStaleSinceMarkers(root, version)) {
  console.log(hit);
}
