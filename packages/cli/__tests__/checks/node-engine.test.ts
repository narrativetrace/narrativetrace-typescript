// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkNodeEngine } from "../../src/doctor/checks/node-engine.js";
import { pkg, snapshot, withPackages } from "../fixture.js";

describe("checkNodeEngine", () => {
  test("passes when the running Node satisfies the default >=20 floor", () => {
    const finding = checkNodeEngine(snapshot({ nodeVersion: "20.11.0" }));
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("toolchain.node-engine");
    expect(finding.fix).toBe("");
  });

  test("fails when the running Node is below the default floor", () => {
    const finding = checkNodeEngine(snapshot({ nodeVersion: "18.19.0" }));
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("18.19.0");
    expect(finding.fix).not.toBe("");
  });

  test("reads the required engine from the installed @narrativetrace/core package", () => {
    const finding = checkNodeEngine(
      snapshot({
        nodeVersion: "21.0.0",
        installedPackages: withPackages({
          "@narrativetrace/core": pkg({ engines: { node: ">=22" } }),
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain(">=22");
  });

  test("falls back to @narrativetrace/core-node when core declares no engines", () => {
    const finding = checkNodeEngine(
      snapshot({
        nodeVersion: "21.0.0",
        installedPackages: withPackages({
          "@narrativetrace/core": pkg(),
          "@narrativetrace/core-node": pkg({ engines: { node: ">=22" } }),
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain(">=22");
  });

  test("falls back to the repo default when neither package declares engines", () => {
    const finding = checkNodeEngine(
      snapshot({
        nodeVersion: "20.0.0",
        installedPackages: withPackages({
          "@narrativetrace/core": pkg(),
          "@narrativetrace/core-node": pkg(),
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });
});
