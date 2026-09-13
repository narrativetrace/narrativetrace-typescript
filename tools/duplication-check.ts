// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { decide, readBaseline, readExemptions } from "./duplication-baseline.js";
import { readScanJson } from "./duplication-shared.js";

// Ratchets `reports/duplication/duplication.json`'s main-tree percentage and largest non-exempt
// cluster against `config/duplication/baseline.properties` (never a fixed percentage — see
// documentation/duplication.md). Wired into `pnpm run check` as `pnpm run duplication:check`,
// which runs `tools/duplication-report.ts` first (a fresh scan every time, never a stale one) —
// see the `duplication:check` script in package.json.

const repoRoot = process.cwd();
const scan = readScanJson(join(repoRoot, "reports/duplication/duplication.json"));
const baseline = readBaseline(join(repoRoot, "config/duplication/baseline.properties"));
const exemptions = readExemptions(join(repoRoot, "config/duplication/exemptions.txt"));

const result = decide(scan.main, baseline, exemptions);
console.log(result.message);
if (!result.passed) {
  process.exit(1);
}
