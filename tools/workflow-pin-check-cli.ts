// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { findPinViolations, MIN_NODE24_MAJOR, ownerRepo } from "./workflow-pin-check.js";

// CLI entry `check` runs every commit, no network: fails on any `.github/workflows/*.yml` step
// pinned below its action's node24-era major (see workflow-pin-check.ts for why).

const repoRoot = process.cwd();
const violations = findPinViolations(repoRoot);

if (violations.length > 0) {
  console.error(`workflow-pin-check: ${violations.length} node20-era action pin(s):`);
  for (const violation of violations) {
    const minMajor = MIN_NODE24_MAJOR[ownerRepo(violation.action)];
    console.error(
      `  ${violation.file}:${violation.line}: ${violation.action} pinned to v${violation.major} (needs >= v${minMajor}): ${violation.text}`,
    );
  }
  process.exit(1);
}
console.log(
  "workflow-pin-check: every pinned action in .github/workflows is on its node24-era major.",
);
