// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "trap.approval-traces";
const FIX =
  "Review each .received.nt diff against its .approved.nt baseline, then run pnpm run approve-narratives (or narrativetrace-approve) to promote it, or delete it if the change was wrong — never commit a .received.nt file.";

/**
 * Approval traces (`.approved.nt` reviewed baselines, `.received.nt` written on a mismatch) landed
 * in the runtime's structural-trace layer. A `.received.nt` sitting in the approved directory is a
 * reviewed-but-not-yet-resolved diff — stale ones are exactly what `what-to-commit.md` warns never
 * to commit, and exactly what a doctor run should surface before someone else does.
 */
export const checkApprovalTraces: DoctorCheck = (snapshot) => {
  const paths = [...snapshot.approvedDirFiles.keys()];
  if (paths.length === 0) {
    return pass(
      ID,
      "no approval traces configured yet — nothing to check",
      DOC.approvalTracesEndToEnd,
    );
  }
  const received = paths.filter((p) => p.endsWith(".received.nt"));
  if (received.length > 0) {
    const message = `${received.length} stale received trace(s) found: ${received.join(", ")}`;
    return fail(ID, message, FIX, DOC.approvalTracesEndToEnd);
  }
  const approved = paths.filter((p) => p.endsWith(".approved.nt"));
  const message = `${approved.length} approved trace(s) found, no pending received diffs`;
  return pass(ID, message, DOC.approvalTracesEndToEnd);
};
