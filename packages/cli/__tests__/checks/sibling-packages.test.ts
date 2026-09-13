// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkSiblingPackages } from "../../src/doctor/checks/sibling-packages.js";
import { NT_VITEST_PACKAGE, pkg, snapshot, withPackages } from "../fixture.js";

describe("checkSiblingPackages", () => {
  test("passes when @narrativetrace/vitest is not installed", () => {
    const finding = checkSiblingPackages(snapshot());
    expect(finding.status).toBe("pass");
  });

  test("passes when every sibling of @narrativetrace/vitest resolves", () => {
    const finding = checkSiblingPackages(
      snapshot({
        installedPackages: withPackages({
          "@narrativetrace/vitest": NT_VITEST_PACKAGE,
          "@narrativetrace/clarity": pkg(),
          "@narrativetrace/core-node": pkg(),
          "@narrativetrace/diagrams": pkg(),
          "@narrativetrace/glossary": pkg(),
          "@narrativetrace/proxy": pkg(),
        }),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("5 sibling");
  });

  test("passes when @narrativetrace/vitest declares no dependencies at all", () => {
    const finding = checkSiblingPackages(
      snapshot({
        installedPackages: withPackages({ "@narrativetrace/vitest": pkg() }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("fails naming the sibling packages pnpm's strict layout hid from the consumer", () => {
    const finding = checkSiblingPackages(
      snapshot({
        installedPackages: withPackages({
          "@narrativetrace/vitest": NT_VITEST_PACKAGE,
          "@narrativetrace/clarity": pkg(),
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("@narrativetrace/core-node");
    expect(finding.message).toContain("@narrativetrace/diagrams");
    expect(finding.message).not.toContain("@narrativetrace/clarity,");
  });
});
