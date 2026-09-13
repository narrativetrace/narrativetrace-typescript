// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkVitestPeer } from "../../src/doctor/checks/vitest-peer.js";
import { NT_VITEST_PACKAGE, pkg, snapshot, withPackages } from "../fixture.js";

describe("checkVitestPeer", () => {
  test("passes when @narrativetrace/vitest is not installed", () => {
    const finding = checkVitestPeer(snapshot());
    expect(finding.status).toBe("pass");
  });

  test("passes when the installed vitest satisfies the declared peer range", () => {
    const finding = checkVitestPeer(
      snapshot({
        installedPackages: withPackages({
          "@narrativetrace/vitest": NT_VITEST_PACKAGE,
          vitest: pkg({ version: "3.2.0" }),
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("fails when the installed vitest is outside the declared peer range", () => {
    const finding = checkVitestPeer(
      snapshot({
        installedPackages: withPackages({
          "@narrativetrace/vitest": NT_VITEST_PACKAGE,
          vitest: pkg({ version: "0.34.0" }),
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("0.34.0");
  });

  test("fails when @narrativetrace/vitest is installed but vitest itself is not", () => {
    const finding = checkVitestPeer(
      snapshot({
        installedPackages: withPackages({ "@narrativetrace/vitest": NT_VITEST_PACKAGE }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("no vitest install");
  });
});
