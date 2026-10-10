// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { CHECKS, recordedStatus } from "./vendor-validate-support.js";
import { type CommandOutcome, runCommand } from "./verify-all-exec.js";

export interface VendorValidationOutcome {
  readonly outcome: CommandOutcome;
  /** Each check's recorded status line (`passed: ...` / `failed: ...` / `skipped: ...` / `never-ran`). */
  readonly statuses: ReadonlyMap<string, string>;
}

/**
 * Runs the real `vendor-validate` task as its own subprocess, then reads back what it RECORDED
 * for each row rather than trusting the subprocess's own exit code: the task itself only fails on
 * an outright rejection (`vendor-validate-support.ts`'s `aggregate` === `"failed"`), so a SKIPPED
 * run also exits zero — and "nothing was validated" must never read as "validated" in this
 * category's own status.
 */
export function runVendorValidation(repoRoot: string, logDir: string): VendorValidationOutcome {
  const outcome = runCommand(
    "pnpm",
    ["run", "vendor-validate"],
    join(logDir, "vendor-validation.log"),
    { cwd: repoRoot },
  );
  const reportsDir = join(repoRoot, "reports/vendor-validation");
  const statuses = new Map(
    CHECKS.map((check) => [check.tool, recordedStatus(reportsDir, check.tool)]),
  );
  return { outcome, statuses };
}
