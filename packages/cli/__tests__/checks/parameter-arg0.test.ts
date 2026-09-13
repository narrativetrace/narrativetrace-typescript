// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkParameterArg0 } from "../../src/doctor/checks/parameter-arg0.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkParameterArg0", () => {
  test("passes when no rendered output exists yet", () => {
    const finding = checkParameterArg0(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("trap.parameter-arg0");
    expect(finding.message).toBe(
      "no rendered output found yet — run your tests or app once to check this",
    );
  });

  test("passes when rendered output carries real parameter names", () => {
    const finding = checkParameterArg0(
      snapshot({
        outputFiles: withFiles({
          "narrativetrace-output/trace.md": '`OrderService.placeOrder(customerId: "C1")`',
        }),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toBe(
      "rendered output carries real parameter names — no arg0 placeholders found",
    );
  });

  test("fails when rendered output shows arg0 placeholders", () => {
    const finding = checkParameterArg0(
      snapshot({
        outputFiles: withFiles({
          "narrativetrace-output/trace.md": '`OrderService.placeOrder(arg0: "C1")`',
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("narrativetrace-output/trace.md");
    expect(finding.fix).toContain("Pass parameter names explicitly");
  });
});
