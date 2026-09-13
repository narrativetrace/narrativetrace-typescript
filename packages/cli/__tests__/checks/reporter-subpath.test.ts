// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkReporterSubpath } from "../../src/doctor/checks/reporter-subpath.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkReporterSubpath", () => {
  test("passes when no vitest.config is present", () => {
    expect(checkReporterSubpath(snapshot()).status).toBe("pass");
  });

  test("passes when the reporter is imported from the /reporters subpath", () => {
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.ts": `import { ClaritySuiteReporter } from "@narrativetrace/vitest/reporters";`,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("fails when the reporter is imported from the package root", () => {
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.ts": `import { ClaritySuiteReporter } from "@narrativetrace/vitest";`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("vitest.config.ts");
    expect(finding.fix).toContain("/reporters");
  });
});
