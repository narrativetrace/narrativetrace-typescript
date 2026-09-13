// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-approval-traces: with approval mode on and no approved trace committed yet, the
// test fails (expected — nothing is approved) but must still write a value-free .nt "received"
// structural artifact for review.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const TEST_FILE = "contract-probe-approval.test.ts";
rmSync("narrativetrace-approved", { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
const test = createNarrativeTest({ approval: true });
test("contract probe approval trace", () => {});
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
  execFileSync("npx", ["vitest", "run", TEST_FILE], { stdio: "ignore" });
} catch {
  // The first run is EXPECTED to fail — nothing is approved yet. What matters is the artifact.
} finally {
  observed =
    findsReceivedNt("narrativetrace-approved") || findsReceivedNt(".")
      ? "writes-nt-artifact"
      : "no-nt-artifact";
  rmSync(TEST_FILE, { force: true });
  rmSync("narrativetrace-approved", { recursive: true, force: true });
  rmSync("narrativetrace-output", { recursive: true, force: true });
}
console.log(observed);
