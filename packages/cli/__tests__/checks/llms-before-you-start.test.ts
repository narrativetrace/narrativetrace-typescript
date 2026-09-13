// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkLlmsBeforeYouStart } from "../../src/doctor/checks/llms-before-you-start.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkLlmsBeforeYouStart", () => {
  test("passes when package.json declares type: module", () => {
    const finding = checkLlmsBeforeYouStart(
      snapshot({ rootPackageJson: { name: "consumer", type: "module" } }),
    );
    expect(finding.status).toBe("pass");
  });

  test("passes when no plain .js file uses ESM import syntax", () => {
    const finding = checkLlmsBeforeYouStart(
      snapshot({
        rootPackageJson: { name: "consumer" },
        sourceFiles: withFiles({ "index.ts": `import { x } from "y";` }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("fails when a plain .js file uses import with no type: module", () => {
    const finding = checkLlmsBeforeYouStart(
      snapshot({
        rootPackageJson: { name: "consumer" },
        sourceFiles: withFiles({
          "index.js": `import { NarrativeTraceConfig } from "@narrativetrace/core-node";`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("index.js");
    expect(finding.fix).toContain("npm pkg set type=module");
  });
});
