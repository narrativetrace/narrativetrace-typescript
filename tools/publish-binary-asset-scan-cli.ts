// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { findGatedBytesInBinaryAssets } from "./publish-binary-asset-scan.js";

// CLI entry the publish pipeline's trace and reference gates shell out to: byte-scans every
// staged binary asset (images, PDFs, fonts, archives — anything a text `grep -I` skips) for the
// given pattern, case-insensitive. Prints one relative path per hit; the bash caller filters the
// output through `.publishallow` and treats anything left as a failure, the same discipline as
// every other gate in the pipeline. Always exits 0 — reporting what it found is this script's
// whole job, not deciding whether that is fatal.

const [, , root, patternSource] = process.argv;
if (!root || !patternSource) {
  console.error("usage: tsx publish-binary-asset-scan-cli.ts <stageRoot> <patternSource>");
  process.exit(1);
}

for (const hit of findGatedBytesInBinaryAssets(root, new RegExp(patternSource, "i"))) {
  console.log(hit);
}
