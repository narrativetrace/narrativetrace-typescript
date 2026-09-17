// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type DeepFixtureAllowlistEntry, lint } from "./deep-fixture-budget.js";

// CLI entry `check` runs every commit, no network: fails on any `test(`/`it(` in a `*.test.ts`
// file (excluding `*.stress.test.ts`, budgeted separately by its own env-driven turbo task) that
// builds a 50,000- or 10,000-node chain/tree fixture — a known builder call (`deepChain`,
// `deepChainJson`, `chain`, `documentNesting`) or a raw loop that grows a chain by reassigning a
// variable to a call referencing itself — yet declares no third (timeout) argument. vitest's
// 5000ms default is a wall-clock budget, and release retrospective rule 3 says that budget must
// never be implicit for a test whose legitimate cost varies with scheduler contention: the class
// this guard exists to stop from regrowing after the 2026-09-17 deep-tree budget commit. The
// allowlist excuses a named, reasoned exception (a fixture that fails fast, before any tree
// walk) — never a whole file, and never silently: a stale entry fails the gate too.

const REPO_ROOT = process.cwd();
const ALLOWLIST_PATH = "tools/deep-fixture-budget-allowlist.json";

const allowlist = JSON.parse(
  readFileSync(join(REPO_ROOT, ALLOWLIST_PATH), "utf-8"),
) as DeepFixtureAllowlistEntry[];

const { violations, staleAllowlistEntries } = lint(REPO_ROOT, allowlist);

if (violations.length > 0) {
  console.error(
    `deep-fixture-budget: ${violations.length} test(s) build a 50k/10k-node fixture with no explicit timeout:`,
  );
  for (const v of violations) console.error(`  ${v.file}:${v.line}: ${v.name}`);
  console.error(
    `  (give it a third argument — an explicit timeout with measured headroom — or add a reasoned exception to ${ALLOWLIST_PATH})`,
  );
  process.exit(1);
}
if (staleAllowlistEntries.length > 0) {
  console.error(
    `deep-fixture-budget: ${staleAllowlistEntries.length} stale allowlist entry(ies) — no matching hit, remove from ${ALLOWLIST_PATH}:`,
  );
  for (const e of staleAllowlistEntries) console.error(`  ${e.file}: ${e.testName}`);
  process.exit(1);
}
console.log(
  `deep-fixture-budget: every deep chain/tree fixture test declares its own budget (${allowlist.length} reasoned exception(s)).`,
);
