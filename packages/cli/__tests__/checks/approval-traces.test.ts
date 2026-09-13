// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkApprovalTraces } from "../../src/doctor/checks/approval-traces.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkApprovalTraces", () => {
  test("passes when no approval traces are configured", () => {
    expect(checkApprovalTraces(snapshot()).status).toBe("pass");
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
  });
});
