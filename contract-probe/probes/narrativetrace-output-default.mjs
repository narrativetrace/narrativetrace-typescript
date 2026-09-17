// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-narrativetrace-output-default: with NARRATIVETRACE_OUTPUT unset, createNarrativeTest
// must still write trace files — the documented default is "on", not opt-in.
//
// The fixture below is the Installation Guide's "With file output" consumer in shape: a test body
// that DESTRUCTURES `narrativeContext` and traces a real call through it. Both halves are
// load-bearing. Vitest's `test.extend` fixtures are lazy — a body written `() => {}` never
// constructs `narrativeContext` at all — and an empty trace deliberately writes no artifact
// ("An empty trace records nothing, so an empty suite produces no artifacts"). An earlier version
// of this probe used `() => {}` and measured neither, reporting "false" against a package that
// writes its files exactly as documented.
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { assertFixtureRan, runVitest } from "./probe-support.mjs";

const TEST_FILE = "contract-probe-output-default.test.ts";
const OUTPUT_DIR = "narrativetrace-output";
rmSync(OUTPUT_DIR, { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";
const test = createNarrativeTest();
class OrderService { placeOrder(customerId, productId, quantity) { return { customerId }; } }
test("contract probe writes output", ({ narrativeContext }) => {
  traceObject(new OrderService(), narrativeContext).placeOrder("C1", "P1", 2);
});
`,
);

let observed = "false";
try {
  const run = runVitest([TEST_FILE], { NARRATIVETRACE_OUTPUT: undefined });
  assertFixtureRan(run, 1, true);
  observed =
    existsSync(OUTPUT_DIR) && readdirSync(OUTPUT_DIR, { recursive: true }).length > 0
      ? "true"
      : "false";
} finally {
  rmSync(TEST_FILE, { force: true });
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
console.log(observed);
