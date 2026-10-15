// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Parity check C7 (2026-10-11): a failing test gets its own narrative, written where the docs say
// (`narrativetrace-output/<module>/<test_name>.md` under the working directory), and the failure is
// visible in it. Proven through a REAL vitest run of a checkout project whose payment is declined.
const SANDBOX_ROOT = resolve("narrativetrace-output");
const VITEST_BIN = resolve("node_modules/.bin/vitest");
// Each case spawns a real vitest process — wall time is the child's startup, not a test input.
const CHILD_RUN_TIMEOUT_MS = 120_000;

const DECLINED_SPEC = `
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";

const narrativeTest = createNarrativeTest();
class Inventory { reserve(sku: string, qty: number): boolean { return qty > 0 && sku.length > 0; } }
class Payments { charge(orderId: string, amount: number): string { throw new Error("card declined for " + orderId); } }

narrativeTest("places an order", ({ narrativeContext }) => {
  const inventory = traceObject(new Inventory(), narrativeContext, { reserve: ["sku", "qty"] });
  const payments = traceObject(new Payments(), narrativeContext, { charge: ["orderId", "amount"] });
  inventory.reserve("P1", 2);
  payments.charge("O1", 20);
});
`;

let project: string;

function runDeclinedCheckout() {
  const result = spawnSync(VITEST_BIN, ["run", "--config", "vitest.config.mjs"], {
    cwd: project,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe(
  "a failing test's narrative, through a real vitest run",
  { timeout: CHILD_RUN_TIMEOUT_MS },
  () => {
    beforeEach(() => {
      mkdirSync(SANDBOX_ROOT, { recursive: true });
      project = mkdtempSync(join(SANDBOX_ROOT, "parity-c7-"));
      writeFileSync(join(project, "vitest.config.mjs"), "export default { test: {} };\n");
      writeFileSync(join(project, "checkout.test.ts"), DECLINED_SPEC);
    });

    afterEach(() => rmSync(project, { recursive: true, force: true }));

    it("writes the narrative at the documented path and shows the declined charge in it", () => {
      const run = runDeclinedCheckout();

      expect(run.status).not.toBe(0);
      const narrative = join(project, "narrativetrace-output", "checkout", "places_an_order.md");
      expect(existsSync(narrative)).toBe(true);
      const content = readFileSync(narrative, "utf-8");
      expect(content).toContain("Inventory.reserve");
      expect(content).toContain("Payments.charge");
      expect(content).toContain("card declined for O1");
      expect(content).toContain("error_count: 1");
    });

    it("prints the narrative of the failed test in the run output", () => {
      const run = runDeclinedCheckout();

      expect(run.output).toContain("Execution trace:");
      expect(run.output).toContain("Payments.charge");
    });
  },
);
