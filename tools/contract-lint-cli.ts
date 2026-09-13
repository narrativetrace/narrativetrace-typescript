// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { lint, parseContractYaml, unreleasedMarkerVersions } from "./contract-lint.js";

// CLI entry the publish pipeline's `check` script runs every commit, no network: validates
// documentation/contract.yaml's schema, anchors, since-markers and duplicate claims (see
// contract-lint.ts). Exits 1 naming every problem found.

const REPO_ROOT = process.cwd();
const CONTRACT_PATH = "documentation/contract.yaml";

const document = parseContractYaml(readFileSync(CONTRACT_PATH, "utf-8"));
const problems = lint(REPO_ROOT, document, unreleasedMarkerVersions(REPO_ROOT));

if (problems.length > 0) {
  console.error(`${CONTRACT_PATH}: ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `contract-lint: ${document.entries.length} entries, ${CONTRACT_PATH} is internally consistent`,
);
