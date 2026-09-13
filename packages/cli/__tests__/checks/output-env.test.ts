// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkOutputEnv } from "../../src/doctor/checks/output-env.js";
import { snapshot } from "../fixture.js";

describe("checkOutputEnv", () => {
  test("passes when unset", () => {
    expect(checkOutputEnv(snapshot({ env: {} })).status).toBe("pass");
  });

  test.each(["true", "false", "TRUE", "False"])("passes for %s", (value) => {
    expect(checkOutputEnv(snapshot({ env: { NARRATIVETRACE_OUTPUT: value } })).status).toBe("pass");
  });

  test("fails for a typo'd value", () => {
    const finding = checkOutputEnv(snapshot({ env: { NARRATIVETRACE_OUTPUT: "flase" } }));
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("flase");
    expect(finding.fix).not.toBe("");
  });
});
