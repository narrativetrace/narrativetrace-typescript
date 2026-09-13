// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkReporterSubpath } from "../../src/doctor/checks/reporter-subpath.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkReporterSubpath", () => {
  test("passes when no vitest.config is present", () => {
    const finding = checkReporterSubpath(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("config.reporter-subpath");
    expect(finding.message).toBe("no vitest.config found — nothing to check");
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
    expect(finding.message).toBe(
      "every registered reporter is imported from the /reporters subpath",
    );
  });

  test("passes when a config imports from the root for reasons unrelated to a reporter", () => {
    // Importing from the package root is only the trap when a reporter name is actually pulled
    // in that way — an unrelated named import from the root is not itself a violation.
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.ts": `import { defineNarrativeTraceConfig } from "@narrativetrace/vitest";`,
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

  test("a vitest.config.mts file is recognized and checked", () => {
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.mts": `import { ClaritySuiteReporter } from "@narrativetrace/vitest";`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("a vitest.config.ts.bak file is not treated as a real vitest config", () => {
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.ts.bak": `import { ClaritySuiteReporter } from "@narrativetrace/vitest";`,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toBe("no vitest.config found — nothing to check");
  });

  test("root-import detection tolerates extra whitespace after 'from'", () => {
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.ts": `import { ClaritySuiteReporter } from  "@narrativetrace/vitest";`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("subpath-import detection tolerates extra whitespace after 'from', suppressing the root-import flag", () => {
    // The root import here would normally be a violation, but the file also references the
    // /reporters subpath (with extra whitespace) — the subpath check must still recognize it and
    // treat the file as fine, exactly as it would with single-space formatting.
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.ts": [
            `import { ClaritySuiteReporter } from "@narrativetrace/vitest";`,
            `// also available: from  "@narrativetrace/vitest/reporters"`,
          ].join("\n"),
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("a properly-quoted /reporters import is still recognized alongside a root import", () => {
    const finding = checkReporterSubpath(
      snapshot({
        sourceFiles: withFiles({
          "vitest.config.ts": [
            `import { ClaritySuiteReporter } from "@narrativetrace/vitest";`,
            `import { OtherThing } from "@narrativetrace/vitest/reporters";`,
          ].join("\n"),
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });
});
