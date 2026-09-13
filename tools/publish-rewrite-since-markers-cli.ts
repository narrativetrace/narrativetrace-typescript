// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { rewriteSinceMarkers } from "./publish-since-markers.js";

// CLI entry the publish pipeline's `--tag` transform shells out to: rewrites every shipped
// "since VERSION, unreleased" marker in the staged snapshot to drop the qualifier, whole-file and
// whitespace-tolerant (see publish-since-markers.ts). Prints one changed, root-relative path per
// line — the bash caller captures this to know which translated mirrors need their staleness hash
// restamped.

const [, , root, version] = process.argv;
if (!root || !version) {
  console.error("usage: tsx publish-rewrite-since-markers-cli.ts <stageRoot> <version>");
  process.exit(1);
}

for (const path of rewriteSinceMarkers(root, version)) {
  console.log(path);
}
