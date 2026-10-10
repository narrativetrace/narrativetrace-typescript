// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkApprovalMode } from "../../src/doctor/checks/approval-mode.js";
import { pkg, snapshot, withFiles, withPackages } from "../fixture.js";

const BASELINE = withFiles({ "narratives/order/places_order.approved.nt": "scenario: x\n" });

/** A traced test file that turns approval mode on through the fixture option. */
function testFile(body: string): ReadonlyMap<string, string> {
  return withFiles({
    "src/order.test.ts": `import { createNarrativeTest } from "@narrativetrace/vitest";\n${body}`,
  });
}

describe("checkApprovalMode — committed baselines nothing compares", () => {
  test("fails when baselines exist but approval mode is off", () => {
    const finding = checkApprovalMode(snapshot({ approvedDirFiles: BASELINE }));
    expect(finding.id).toBe("config.approval-mode");
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      ".approved.nt baselines exist but approval mode is off — nothing compares them",
    );
  });

  test("passes with no baseline at all", () => {
    const finding = checkApprovalMode(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("nothing for approval mode to compare yet");
  });

  test("a .received.nt alone is not a baseline — it is what a first approval run writes", () => {
    const received = withFiles({ "narratives/order/places_order.received.nt": "x" });
    expect(checkApprovalMode(snapshot({ approvedDirFiles: received })).status).toBe("pass");
  });

  test.each([
    ["the environment", { env: { NARRATIVETRACE_APPROVAL: "true" } }],
    ["the environment, padded and upper case", { env: { NARRATIVETRACE_APPROVAL: " TRUE " } }],
    ["the config file's string setting", { projectConfig: '{ "approval": "true" }' }],
    [
      "the fixture option",
      { sourceFiles: testFile("const test = createNarrativeTest({ approval: true });") },
    ],
    [
      "the test script's environment",
      { rootPackageJson: pkg({ scripts: { test: "NARRATIVETRACE_APPROVAL=true vitest run" } }) },
    ],
    [
      "a workspace module's test script",
      {
        manifests: withPackages({
          "packages/orders/package.json": pkg({
            scripts: { test: "cross-env NARRATIVETRACE_APPROVAL=true vitest" },
          }),
        }),
      },
    ],
    [
      "the vitest config's test env",
      {
        sourceFiles: withFiles({
          "vitest.config.ts": "test: { env: { NARRATIVETRACE_APPROVAL: 'true' } }",
        }),
      },
    ],
  ])("passes when %s turns approval mode on", (_label, overrides) => {
    const finding = checkApprovalMode(snapshot({ approvedDirFiles: BASELINE, ...overrides }));
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("approval mode is on");
  });

  test.each([
    ["a line comment", testFile("// const test = createNarrativeTest({ approval: true });")],
    ["a block comment", testFile("/*\n createNarrativeTest({ approval: true })\n*/")],
    ["an inline block comment", testFile("createNarrativeTest({ /* approval: true */ });")],
    ["the option turned off", testFile("createNarrativeTest({ approval: false });")],
    ["a near-miss name", testFile("createNarrativeTest({ preapproval: true });")],
    ["a near-miss value", testFile("createNarrativeTest({ approval: trueish });")],
    [
      "approval: true in code that is not a NarrativeTrace fixture",
      withFiles({ "src/workflow.ts": "export const step = { approval: true };" }),
    ],
    [
      "the env name only quoted in a string of prose",
      testFile('log("set NARRATIVETRACE_APPROVAL");'),
    ],
  ])("fails when the switch appears only as %s", (_label, sourceFiles) => {
    const finding = checkApprovalMode(snapshot({ approvedDirFiles: BASELINE, sourceFiles }));
    expect(finding.status).toBe("fail");
  });

  test.each([
    ["false in the environment", { env: { NARRATIVETRACE_APPROVAL: "false" } }],
    [
      "a boolean in the config file, which the runtime ignores",
      { projectConfig: '{ "approval": true }' },
    ],
    [
      "a near-miss env name in a script",
      { rootPackageJson: pkg({ scripts: { test: "NARRATIVETRACE_APPROVALS=true vitest" } }) },
    ],
    [
      "a near-miss value in a script",
      { rootPackageJson: pkg({ scripts: { test: "NARRATIVETRACE_APPROVAL=truest vitest" } }) },
    ],
    ["config text that is not JSON", { projectConfig: '{ "approval": "true"' }],
  ])("fails when the only switch is %s", (_label, overrides) => {
    const finding = checkApprovalMode(snapshot({ approvedDirFiles: BASELINE, ...overrides }));
    expect(finding.status).toBe("fail");
  });

  test("the environment wins over the config file, as the runtime resolves it", () => {
    const finding = checkApprovalMode(
      snapshot({
        approvedDirFiles: BASELINE,
        env: { NARRATIVETRACE_APPROVAL: "false" },
        projectConfig: '{ "approval": "true" }',
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("the fix names every switch this runtime reads", () => {
    const { fix } = checkApprovalMode(snapshot({ approvedDirFiles: BASELINE }));
    expect(fix).toContain("NARRATIVETRACE_APPROVAL=true");
    expect(fix).toContain('"approval": "true"');
    expect(fix).toContain("approval: true");
    expect(fix).toContain(".received.nt");
  });
});
