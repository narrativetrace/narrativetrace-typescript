// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkApprovalMode } from "../src/doctor/checks/approval-mode.js";
import { looksStructural } from "../src/feedback/structural-trace.js";
import { pkg, snapshot, withFiles, withPackages } from "./fixture.js";

const BASELINE = withFiles({ "narratives/order/places_order.approved.nt": "scenario: x\n" });

/** A traced test file that imports the NarrativeTrace fixture, with the given body. */
function testFile(body: string): ReadonlyMap<string, string> {
  return withFiles({
    "src/order.test.ts": `import { createNarrativeTest } from "@narrativetrace/vitest";\n${body}`,
  });
}

function approvalStatus(overrides: Parameters<typeof snapshot>[0]): string {
  return checkApprovalMode(snapshot({ approvedDirFiles: BASELINE, ...overrides })).status;
}

describe("checkApprovalMode — the switch only counts where the runtime reads it", () => {
  // Adversarial finding, FIXED: approval-mode.ts read the fixture option from any live source text in a
  // file that imports @narrativetrace/vitest, and string literals are live text. A test asserting
  // on the documentation string "approval: true" therefore makes the check pass while approval
  // mode is still off, which is the silent false pass the check exists to prevent.
  test("the option spelled inside a string literal of a fixture file is not the switch", () => {
    const sourceFiles = testFile('expect(help).toContain("approval: true");');
    expect(approvalStatus({ sourceFiles })).toBe("fail");
  });

  // Adversarial finding, FIXED: `??=`, `||=` and `&&=` assign the variable too, but ENV_ON only accepts a
  // bare `=` or `:` straight after the name, so a conditional default in a vitest config is missed.
  test("a logical-assignment default of the environment variable turns the switch on", () => {
    const sourceFiles = withFiles({
      "vitest.config.ts": 'process.env.NARRATIVETRACE_APPROVAL ??= "true";',
    });
    expect(approvalStatus({ sourceFiles })).toBe("pass");
  });

  test("an empty environment variable is unset, so the config file's setting stands", () => {
    const overrides = {
      env: { NARRATIVETRACE_APPROVAL: "" },
      projectConfig: '{ "approval": "true" }',
    };
    expect(approvalStatus(overrides)).toBe("pass");
  });

  test("a variable that only ends in the switch's name is a different variable", () => {
    const rootPackageJson = pkg({
      scripts: { test: "MY_NARRATIVETRACE_APPROVAL=true vitest run" },
    });
    expect(approvalStatus({ rootPackageJson })).toBe("fail");
  });

  test("an exported assignment in a script is the switch", () => {
    const rootPackageJson = pkg({
      scripts: { test: "export NARRATIVETRACE_APPROVAL=true && vitest run" },
    });
    expect(approvalStatus({ rootPackageJson })).toBe("pass");
  });

  test("a script that only reads the variable in a comparison does not turn the switch on", () => {
    const rootPackageJson = pkg({
      scripts: { test: 'test "$NARRATIVETRACE_APPROVAL" = "true" && vitest run' },
    });
    expect(approvalStatus({ rootPackageJson })).toBe("fail");
  });

  test("a switch commented out in one file does not count, but the live one in another does", () => {
    const sourceFiles = withFiles({
      "src/a.test.ts":
        'import { createNarrativeTest } from "@narrativetrace/vitest";\n// approval: true',
      "src/b.test.ts":
        'import { createNarrativeTest } from "@narrativetrace/vitest";\ncreateNarrativeTest({ approval: true });',
    });
    expect(approvalStatus({ sourceFiles })).toBe("pass");
  });

  test("the fixture package named only in a comment does not make the option count", () => {
    const sourceFiles = withFiles({
      "src/order.test.ts": "// @narrativetrace/vitest\nconst x = { approval: true };",
    });
    expect(approvalStatus({ sourceFiles })).toBe("fail");
  });
});

describe("looksStructural — the grammar refuses what a report must not carry", () => {
  // Adversarial finding, FIXED: structural-trace.ts says line endings are a checkout's encoding and reads
  // CRLF per line, but a byte-order mark an editor adds to the first line is an encoding too. The
  // header test runs on the raw line, so a BOM-prefixed trace is refused as "not structural".
  test("a trace whose first line starts with a byte-order mark is still a structural trace", () => {
    expect(looksStructural("\uFEFFscenario: x\n\n#1 - A.b()\n")).toBe(true);
  });

  test("a raw line separator smuggled between two calls is refused, not read as two lines", () => {
    expect(looksStructural("scenario: x\n\n- A.b(x) - C.d()\n")).toBe(false);
  });

  test("a walk marker must be the last thing on a call line", () => {
    expect(looksStructural("scenario: x\n\n- A.b() … (cycle) → value\n")).toBe(false);
  });

  test.each([
    ["- A.b() →value"],
    ["- A.b() !! "],
    ["- A.b() ?? incomplete extra"],
  ])("an outcome written as %j is refused", (line) => {
    expect(looksStructural(`scenario: x\n\n${line}\n`)).toBe(false);
  });

  test("a span id spelled with a non-ASCII digit is not an id", () => {
    expect(looksStructural("scenario: x\n\n#\u0661.2 - A.b()\n")).toBe(false);
  });

  test("a value inside the parameter list makes the whole line, and so the file, refused", () => {
    expect(looksStructural("scenario: x\n\n- A.b(amount: 4599)\n")).toBe(false);
  });

  test("a span id and a depth-limit walk marker together read as one stopped leaf", () => {
    expect(looksStructural("scenario: x\n\n#1.2 - A.b() !! Error … (depth limit)\n")).toBe(true);
  });
});
