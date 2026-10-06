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
    expect(finding.id).toBe("toolchain.vitest-peer");
    expect(finding.message).toBe("@narrativetrace/vitest is not installed — nothing to check");
  });

  test("passes without throwing when @narrativetrace/vitest declares no peer range", () => {
    // ntVitest is present but has no peerDependencies field at all — the range lookup chains two
    // optional accesses, and getting either wrong either throws or mis-routes this case away from
    // the early "nothing to check" pass.
    const finding = checkVitestPeer(
      snapshot({
        installedPackages: withPackages({ "@narrativetrace/vitest": pkg() }),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toBe("@narrativetrace/vitest is not installed — nothing to check");
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
    expect(finding.message).toBe(
      `vitest@3.2.0 satisfies the declared peer range ${NT_VITEST_PACKAGE.peerDependencies?.vitest}`,
    );
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
    expect(finding.message).toContain(
      "does not satisfy @narrativetrace/vitest's declared peer range",
    );
    expect(finding.fix).toContain("rm -rf node_modules && npm ci");
  });

  test("fails when @narrativetrace/vitest is installed but vitest itself is not", () => {
    const finding = checkVitestPeer(
      snapshot({
        installedPackages: withPackages({ "@narrativetrace/vitest": NT_VITEST_PACKAGE }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("no vitest install");
    expect(finding.fix).toContain("npm add -D vitest");
  });
});
