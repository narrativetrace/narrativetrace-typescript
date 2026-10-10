// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregate, CHECKS, record, stageFromHead, validate } from "./vendor-validate-support.js";

// `vendorValidate` — the seam where a VENDOR's own validator checks an artifact this repository
// publishes for that vendor to read (ruling D6, phase-4-design-2026-09-27.md). Heavy / scheduled
// verification tier: a `pnpm run vendor-validate` script in the root package.json, beside `mutate`
// — NEVER part of `check`, because a per-commit gate may not depend on a third-party CLI being
// installed. The precondition lives in each row's own run (vendor-validate-support.ts's
// `validate`), never in a CI-side exclusion: an absent tool skips with one line naming it and how
// to install it, and so does a tool that is present but fails its own probe.

const REPO_ROOT = process.cwd();
const REPORTS_DIR = join(REPO_ROOT, "reports/vendor-validation");

function runOne(check: (typeof CHECKS)[number]): ReturnType<typeof validate> {
  const stage = mkdtempSync(join(tmpdir(), "nt-vendor-validate-"));
  try {
    stageFromHead(REPO_ROOT, check.stagedPaths, stage);
    const result = validate(check, stage, process.env.PATH);
    record(REPORTS_DIR, result);
    console.log(`vendor-validate: ${check.tool} ${result.outcome} — ${result.message}`);
    return result;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function main(): void {
  const results = CHECKS.map(runOne);
  const outcome = aggregate(results);
  if (outcome === "failed") {
    console.error(
      "vendor-validate: a vendor rejected an artifact this repository publishes — see the output above",
    );
    process.exitCode = 1;
    return;
  }
  if (outcome === "skipped") {
    console.log(
      "vendor-validate: every row SKIPPED — nothing was validated. A skip is not a pass; see the install hint(s) above.",
    );
    return;
  }
  const passedCount = results.filter((r) => r.outcome === "passed").length;
  console.log(`vendor-validate: ${passedCount} row(s) passed.`);
}

main();
