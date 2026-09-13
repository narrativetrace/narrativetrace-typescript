// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { parseRestoreExceptions, restoreExceptions } from "./publish-restore-exceptions.js";

// CLI entry the publish pipeline shells out to right after applying `.publishignore`'s strip
// patterns: restores every `!`-prefixed exception path from the pristine pre-strip snapshot.
// Prints one "restored <path>" line per path restored; a `!` path missing from the pristine
// snapshot is a hard error — a stale or mistyped exception should fail the run loudly, never ship
// silently incomplete.

const [, , stageRoot, pristineRoot, ignoreFile] = process.argv;
if (!stageRoot || !pristineRoot || !ignoreFile) {
  console.error(
    "usage: tsx publish-restore-exceptions-cli.ts <stageRoot> <pristineRoot> <ignoreFile>",
  );
  process.exit(1);
}

const exceptions = parseRestoreExceptions(readFileSync(ignoreFile, "utf-8"));
const { restored, missing } = restoreExceptions(stageRoot, pristineRoot, exceptions);
for (const path of restored) console.log(`restored ${path}`);
if (missing.length > 0) {
  console.error(
    `ERROR: .publishignore exception path(s) not found in the pristine snapshot: ${missing.join(", ")}`,
  );
  process.exit(1);
}
