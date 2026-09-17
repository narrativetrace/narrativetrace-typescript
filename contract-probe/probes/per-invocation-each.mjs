// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-per-invocation-each: each invocation of one .each() call gets its own artifact set
// — two invocations must produce two distinct trace files, never one overwriting the other.
//
// `.each`'s generated wrapper DOES destructure `narrativeContext` for every row, so unlike the
// sibling probes the fixture here was instantiated even with an empty body — but an empty trace
// deliberately writes no artifact at all, so the first version of this probe counted zero files
// and reported "one-artifact-set" against a package that writes two. The row bodies now trace a
// real call, and the distinctness assertion is on the file NAMES, not just the count: two
// artifacts that happened to share a name would be the exact defect this entry guards.
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { assertFixtureRan, runVitest } from "./probe-support.mjs";

const TEST_FILE = "contract-probe-each.test.ts";
const OUTPUT_DIR = "narrativetrace-output";
rmSync(OUTPUT_DIR, { recursive: true, force: true });

writeFileSync(
  TEST_FILE,
  `import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";
const test = createNarrativeTest();
class OrderService { placeOrder(quantity) { return { quantity }; } }
test.each([1, 2])("contract probe each %i", (quantity, { narrativeContext }) => {
  traceObject(new OrderService(), narrativeContext).placeOrder(quantity);
});
`,
);

let observed = "one-artifact-set";
try {
  assertFixtureRan(runVitest([TEST_FILE]), 2, true);
  const md = existsSync(OUTPUT_DIR)
    ? readdirSync(OUTPUT_DIR, { recursive: true })
        .map(String)
        .filter((name) => name.endsWith(".md"))
    : [];
  observed = new Set(md).size >= 2 ? "distinct-per-invocation" : "one-artifact-set";
} finally {
  rmSync(TEST_FILE, { force: true });
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
console.log(observed);
