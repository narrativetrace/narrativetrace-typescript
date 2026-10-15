// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Parity check C3 (2026-10-11): approval mode proven through a REAL vitest run of a checkout
// project (reserve inventory, charge payment, save order) — approve once, then drop a call.
const SANDBOX_ROOT = resolve("narrativetrace-output");
// Each case spawns real vitest processes — wall time is the child's startup, not a test input.
const CHILD_RUN_TIMEOUT_MS = 120_000;
const VITEST_BIN = resolve("node_modules/.bin/vitest");

const CHECKOUT_SPEC = `
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";

const narrativeTest = createNarrativeTest();
class Inventory { reserve(sku: string, qty: number): boolean { return qty > 0 && sku.length > 0; } }
class Payments { charge(orderId: string, amount: number): string { return "tx-" + orderId + amount; } }
class Orders { save(orderId: string): string { return orderId; } }

narrativeTest("places an order", ({ narrativeContext }) => {
  const inventory = traceObject(new Inventory(), narrativeContext, { reserve: ["sku", "qty"] });
  const payments = traceObject(new Payments(), narrativeContext, { charge: ["orderId", "amount"] });
  const orders = traceObject(new Orders(), narrativeContext, { save: ["orderId"] });
  if (process.env.DROP_CALL !== "true") inventory.reserve("P1", 2);
  payments.charge("O1", 20);
  expect(orders.save("O1")).toBe("O1");
});

narrativeTest("adds up", () => {
  expect(1 + 1).toBe(2);
});
`;

let project: string;

function runCheckout(extraEnv: Record<string, string>) {
  const result = spawnSync(VITEST_BIN, ["run", "--config", "vitest.config.mjs"], {
    cwd: project,
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NARRATIVETRACE_APPROVAL: "true",
      NARRATIVETRACE_APPROVED_DIR: join(project, "approved"),
      ...extraEnv,
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function approveReceivedTrace(): void {
  const dir = join(project, "approved", "checkout");
  renameSync(join(dir, "places_an_order.received.nt"), join(dir, "places_an_order.approved.nt"));
}

describe(
  "approval mode, end to end through a real vitest run",
  { timeout: CHILD_RUN_TIMEOUT_MS },
  () => {
    beforeEach(() => {
      mkdirSync(SANDBOX_ROOT, { recursive: true });
      project = mkdtempSync(join(SANDBOX_ROOT, "parity-c3-"));
      writeFileSync(join(project, "vitest.config.mjs"), "export default { test: {} };\n");
      writeFileSync(join(project, "checkout.test.ts"), CHECKOUT_SPEC);
    });

    afterEach(() => rmSync(project, { recursive: true, force: true }));

    it("fails the first run, which has no approved trace, and leaves a received trace to review", () => {
      const first = runCheckout({});

      expect(first.status).not.toBe(0);
      expect(first.output).toContain('No approved trace for scenario "places an order"');
      expect(
        readFileSync(join(project, "approved/checkout/places_an_order.received.nt"), "utf-8"),
      ).toContain("Inventory.reserve(sku, qty)");
    });

    it("passes unchanged against the approved trace", () => {
      runCheckout({});
      approveReceivedTrace();

      expect(runCheckout({}).status).toBe(0);
    });

    it("fails a change that drops a call with a diff naming it, while the ordinary test stays green", () => {
      runCheckout({});
      approveReceivedTrace();

      const dropped = runCheckout({ DROP_CALL: "true" });

      expect(dropped.status).not.toBe(0);
      expect(dropped.output).toContain(
        "Trace changed against the approved trace (-1 call Inventory.reserve)",
      );
      expect(dropped.output).toContain("-#1 - Inventory.reserve(sku, qty)");
      expect(dropped.output).toContain("✓ adds up");
      expect(dropped.output).toContain("1 failed | 1 passed");
    });
  },
);
