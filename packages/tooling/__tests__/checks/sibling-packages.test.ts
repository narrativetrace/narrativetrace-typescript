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
    expect(finding.id).toBe("toolchain.sibling-packages");
  });

  test("only counts @narrativetrace/-namespaced dependencies as siblings", () => {
    // A non-namespaced dependency of @narrativetrace/vitest (e.g. a third-party lib) must never
    // be treated as a sibling this check resolves — even when it happens to be installed too.
    const finding = checkSiblingPackages(
      snapshot({
        installedPackages: withPackages({
          "@narrativetrace/vitest": {
            ...NT_VITEST_PACKAGE,
            dependencies: { "@narrativetrace/clarity": "0.1.3", chalk: "^5.0.0" },
          },
          "@narrativetrace/clarity": pkg(),
        }),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("1 sibling");
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
    expect(finding.message).toContain("do not resolve from the consumer:");
    // Pins the ", " join separator between multiple unresolved names, not just their presence.
    expect(finding.message).toContain(
      "@narrativetrace/core-node, @narrativetrace/diagrams, @narrativetrace/glossary, @narrativetrace/proxy",
    );
    expect(finding.fix).toContain("as explicit direct dependencies");
    expect(finding.fix).toContain(
      "@narrativetrace/core-node, @narrativetrace/diagrams, @narrativetrace/glossary, @narrativetrace/proxy",
    );
  });
});
