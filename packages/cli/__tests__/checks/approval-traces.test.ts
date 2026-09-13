// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkApprovalTraces } from "../../src/doctor/checks/approval-traces.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkApprovalTraces", () => {
  test("passes when no approval traces are configured", () => {
    const finding = checkApprovalTraces(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("trap.approval-traces");
    expect(finding.message).toBe("no approval traces configured yet — nothing to check");
  });

  test("passes when only approved traces exist, no pending received diffs", () => {
    const finding = checkApprovalTraces(
      snapshot({
        approvedDirFiles: withFiles({ "narratives/order.approved.nt": "content" }),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("1 approved");
  });

  test("counts only .approved.nt files as approved, not unrelated files in the directory", () => {
    const finding = checkApprovalTraces(
      snapshot({
        approvedDirFiles: withFiles({
          "narratives/order.approved.nt": "content",
          "narratives/readme.md": "not an approval trace",
        }),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("1 approved trace(s) found");
  });

  test("fails on a stale received trace", () => {
    const finding = checkApprovalTraces(
      snapshot({
        approvedDirFiles: withFiles({
          "narratives/order.approved.nt": "content",
          "narratives/order.received.nt": "content",
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("narratives/order.received.nt");
    expect(finding.fix).toContain("pnpm run approve-narratives");
  });

  test("joins multiple stale received traces with a comma", () => {
    const finding = checkApprovalTraces(
      snapshot({
        approvedDirFiles: withFiles({
          "narratives/order.received.nt": "content",
          "narratives/other.received.nt": "content",
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("narratives/order.received.nt, narratives/other.received.nt");
  });
});
