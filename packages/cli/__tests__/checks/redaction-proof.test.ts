// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkRedactionProof } from "../../src/doctor/checks/redaction-proof.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkRedactionProof", () => {
  test("fails when no test asserts [REDACTED]", () => {
    const finding = checkRedactionProof(
      snapshot({
        sourceFiles: withFiles({
          "src/order.test.ts": `expect(result).toBe("ORD-1");`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("fails when there are no test files at all", () => {
    expect(checkRedactionProof(snapshot()).status).toBe("fail");
  });

  test("passes when a test asserts [REDACTED] for a deny-listed name", () => {
    const finding = checkRedactionProof(
      snapshot({
        sourceFiles: withFiles({
          "src/order.test.ts": `expect(rendered).toContain("[REDACTED]");`,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });
});
