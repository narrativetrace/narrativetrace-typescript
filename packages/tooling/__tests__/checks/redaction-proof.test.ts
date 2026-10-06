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
    expect(finding.id).toBe("trap.redaction-proof");
    expect(finding.message).toBe("no test asserts [REDACTED] — redaction is unproven");
  });

  test("fails when there are no test files at all", () => {
    expect(checkRedactionProof(snapshot()).status).toBe("fail");
  });

  test("a non-test source file containing [REDACTED] does not count as proof", () => {
    // Only a real *.test.ts/*.spec.ts file proves the redaction — a stray occurrence of the
    // literal marker in ordinary source (e.g. the string defined in the redaction module itself)
    // must not be mistaken for a test that asserts it.
    const finding = checkRedactionProof(
      snapshot({
        sourceFiles: withFiles({
          "src/redact.ts": `export const MARKER = "[REDACTED]";`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("a file that merely contains .test. mid-name (not as its suffix) does not count as a test file", () => {
    const finding = checkRedactionProof(
      snapshot({
        sourceFiles: withFiles({
          "src/order.test.ts.snap": `expect(rendered).toContain("[REDACTED]");`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("a .cts test file is recognized as a test file", () => {
    const finding = checkRedactionProof(
      snapshot({
        sourceFiles: withFiles({
          "src/order.test.cts": `expect(rendered).toContain("[REDACTED]");`,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
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
    expect(finding.message).toBe("a test asserts [REDACTED] for a deny-listed parameter name");
  });
});
