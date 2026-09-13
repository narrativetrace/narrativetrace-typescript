// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-run-name-manifest-field: manifest.json must carry a top-level `run` object ({id, name})
// once ManifestSuiteReporter is registered — the documented default shape (2026-09-13 ruling, item
// 2), with no configuration beyond registering the reporter itself.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const TEST_FILE = "contract-probe-run-name-manifest.test.ts";
const CONFIG_FILE = "contract-probe-run-name-manifest.vitest.config.ts";
rmSync("narrativetrace-output", { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";
const test = createNarrativeTest();
class Svc { ping() { return "pong"; } }
test("contract probe names the run in manifest.json", ({ narrativeContext }) => {
  traceObject(new Svc(), narrativeContext).ping();
});
`,
);
writeFileSync(
  CONFIG_FILE,
  `import { defineConfig } from "vitest/config";
import { ManifestSuiteReporter } from "@narrativetrace/vitest/reporters";
export default defineConfig({
  test: { include: ["${TEST_FILE}"], reporters: ["default", new ManifestSuiteReporter()] },
});
`,
);

let observed = "false";
try {
  execFileSync("npx", ["vitest", "run", "--config", CONFIG_FILE], { stdio: "ignore" });
  const manifest = JSON.parse(readFileSync("narrativetrace-output/manifest.json", "utf-8"));
  observed =
    typeof manifest.run?.id === "string" && typeof manifest.run?.name === "string"
      ? "true"
      : "false";
} catch {
  observed = "false";
} finally {
  rmSync(TEST_FILE, { force: true });
  rmSync(CONFIG_FILE, { force: true });
  rmSync("narrativetrace-output", { recursive: true, force: true });
}
console.log(observed);
