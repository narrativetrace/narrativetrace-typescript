// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  findOrderViolations,
  findPinViolations,
  MIN_NODE24_MAJOR,
  ownerRepo,
} from "./workflow-pin-check.js";

// CLI entry `check` runs every commit, no network: fails on any `.github/workflows/*.yml` step
// pinned below its action's node24-era major, or any `actions/setup-node` step not preceded in
// its job by `corepack enable` (see workflow-pin-check.ts for why both checks exist).

const repoRoot = process.cwd();
const pinViolations = findPinViolations(repoRoot);
const orderViolations = findOrderViolations(repoRoot);
let failed = false;

if (pinViolations.length > 0) {
  failed = true;
  console.error(`workflow-pin-check: ${pinViolations.length} node20-era action pin(s):`);
  for (const violation of pinViolations) {
    const minMajor = MIN_NODE24_MAJOR[ownerRepo(violation.action)];
    console.error(
      `  ${violation.file}:${violation.line}: ${violation.action} pinned to v${violation.major} (needs >= v${minMajor}): ${violation.text}`,
    );
  }
}

if (orderViolations.length > 0) {
  failed = true;
  console.error(
    `workflow-pin-check: ${orderViolations.length} actions/setup-node step(s) not preceded by corepack enable:`,
  );
  for (const violation of orderViolations) {
    console.error(`  ${violation.file}:${violation.line}: ${violation.text}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  "workflow-pin-check: every pinned action is on its node24-era major, and every " +
    "actions/setup-node step is preceded by corepack enable in its job.",
);
