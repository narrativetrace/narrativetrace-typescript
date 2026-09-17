// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-run-name-manifest-field: manifest.json must carry a top-level `run` object ({id, name})
// once ManifestSuiteReporter is registered — the documented default shape (2026-09-13 ruling, item
// 2), with no configuration beyond registering the reporter itself.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { assertFixtureRan, runVitest } from "./probe-support.mjs";

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
  // The guard matters even though this entry is green: without it a fixture that stopped running
  // at all would report "false" — a defect report about the package, sourced from a harness that
  // never reached it. A missing manifest.json, by contrast, IS an observation about the package,
  // so it stays a plain "false".
  assertFixtureRan(runVitest(["--config", CONFIG_FILE]), 1, true);
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
