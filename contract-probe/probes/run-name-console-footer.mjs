// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-run-name-console-footer: once ClaritySuiteReporter is registered, the suite footer must
// name the run ("run: <phrase>") right after the header — the documented default shape
// (2026-09-13 ruling, item 2), with no configuration beyond registering the reporter itself.
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const TEST_FILE = "contract-probe-run-name-footer.test.ts";
const CONFIG_FILE = "contract-probe-run-name-footer.vitest.config.ts";
rmSync("narrativetrace-output", { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";
const test = createNarrativeTest();
class Svc { ping() { return "pong"; } }
test("contract probe names the run in the console footer", ({ narrativeContext }) => {
  traceObject(new Svc(), narrativeContext).ping();
});
`,
);
writeFileSync(
  CONFIG_FILE,
  `import { defineConfig } from "vitest/config";
import { ClaritySuiteReporter } from "@narrativetrace/vitest/reporters";
export default defineConfig({
  test: { include: ["${TEST_FILE}"], reporters: ["default", new ClaritySuiteReporter()] },
});
`,
);

let observed = "false";
try {
  const out = execFileSync("npx", ["vitest", "run", "--config", CONFIG_FILE], {
    encoding: "utf-8",
  });
  observed = /\n {2}run: [a-z]+ [a-z]+ [a-z]+\n/.test(out) ? "true" : "false";
} catch {
  observed = "false";
} finally {
  rmSync(TEST_FILE, { force: true });
  rmSync(CONFIG_FILE, { force: true });
  rmSync("narrativetrace-output", { recursive: true, force: true });
}
console.log(observed);
