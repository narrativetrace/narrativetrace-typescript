// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-approval-traces: with approval mode on and no approved trace committed yet, the
// test fails (expected — nothing is approved) but must still write a value-free .nt "received"
// structural artifact for review.
//
// Two corrections over the first version of this probe, both of which made it report
// "no-nt-artifact" against a package that writes the artifact exactly as documented:
//
//   * the fixture's body was `() => {}`. Vitest's `test.extend` fixtures are lazy, so
//     `narrativeContext` was never constructed, and an empty trace deliberately writes nothing —
//     the probe measured its own fixture, not the package. The body now destructures the fixture
//     and traces a real call, the shape the Installation Guide documents.
//   * it looked in `narrativetrace-approved`. The approved-trace directory is `narratives`
//     (`NARRATIVETRACE_APPROVED_DIR`'s default, the same one `narrativetrace doctor` reads), with
//     the received artifact written beside it.
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { assertFixtureRan, runVitest } from "./probe-support.mjs";

const TEST_FILE = "contract-probe-approval.test.ts";
const APPROVED_DIR = "narratives";
const OUTPUT_DIR = "narrativetrace-output";
const scrub = () => {
  for (const dir of [APPROVED_DIR, OUTPUT_DIR]) rmSync(dir, { recursive: true, force: true });
};
scrub();

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";
const test = createNarrativeTest({ approval: true });
class OrderService { placeOrder(customerId) { return { customerId }; } }
test("contract probe approval trace", ({ narrativeContext }) => {
  traceObject(new OrderService(), narrativeContext).placeOrder("C1");
});
`,
);

function findsReceivedNt(dir) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir, { recursive: true }).some((name) =>
    String(name).endsWith(".received.nt"),
  );
}

let observed = "no-nt-artifact";
try {
  // `expectPass` is false here and nowhere else: this run is SUPPOSED to fail — nothing is
  // approved yet. The artifact it leaves behind is the whole claim.
  assertFixtureRan(runVitest([TEST_FILE]), 1, false);
  observed =
    findsReceivedNt(APPROVED_DIR) || findsReceivedNt(OUTPUT_DIR)
      ? "writes-nt-artifact"
      : "no-nt-artifact";
} finally {
  rmSync(TEST_FILE, { force: true });
  scrub();
}
console.log(observed);
