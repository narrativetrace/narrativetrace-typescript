// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-narrativetrace-output-default: with NARRATIVETRACE_OUTPUT unset, createNarrativeTest
// must still write trace files — the documented default is "on", not opt-in.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const TEST_FILE = "contract-probe-output-default.test.ts";
mkdirSync("narrativetrace-output", { recursive: true });
rmSync("narrativetrace-output", { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
const test = createNarrativeTest();
test("contract probe writes output", () => {});
`,
);

let observed = "false";
try {
  const env = { ...process.env };
  delete env.NARRATIVETRACE_OUTPUT;
  execFileSync("npx", ["vitest", "run", TEST_FILE], { env, stdio: "ignore" });
  observed = existsSync("narrativetrace-output") ? "true" : "false";
} catch {
  observed = "false";
} finally {
  rmSync(TEST_FILE, { force: true });
  rmSync("narrativetrace-output", { recursive: true, force: true });
}
console.log(observed);
