// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-per-invocation-each: each invocation of one .each() call gets its own artifact set
// — two invocations must produce two distinct trace files, never one overwriting the other.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const TEST_FILE = "contract-probe-each.test.ts";
rmSync("narrativetrace-output", { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
const test = createNarrativeTest();
test.each([1, 2])("contract probe each %i", () => {});
`,
);

let observed = "one-artifact-set";
try {
  execFileSync("npx", ["vitest", "run", TEST_FILE], { stdio: "ignore" });
} catch {
  // A grading-only fixture — no assertions to fail; a nonzero exit here is unexpected but the
  // artifact count below is still the signal that matters.
} finally {
  const mdFiles = existsSync("narrativetrace-output")
    ? readdirSync("narrativetrace-output", { recursive: true }).filter((name) =>
        String(name).endsWith(".md"),
      )
    : [];
  observed = mdFiles.length >= 2 ? "distinct-per-invocation" : "one-artifact-set";
  rmSync(TEST_FILE, { force: true });
  rmSync("narrativetrace-output", { recursive: true, force: true });
}
console.log(observed);
