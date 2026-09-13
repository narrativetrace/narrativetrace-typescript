// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AsyncNarrativeContext,
  artifactIdentityOfMethod,
  NarrativeTraceConfig,
  parameterCapture,
  structuralScenario,
} from "@narrativetrace/core-node";
import { afterEach, describe, expect, test } from "vitest";
import { writeTraceOutput } from "../src/index.js";
import { resetRunIdentityForTest, runIdentity } from "../src/run-identity-accumulator.js";
import {
  type StructuralIo,
  structuralPaths,
  writeStructuralOutput,
} from "../src/structural-output.js";

/**
 * Proves the 2026-09-13 ruling's item 3 invariant for this runtime: the run name and the trace name
 * NEVER enter the structural `.nt` text, an approved/received trace, or the delta computation — two
 * test-suite executions of the identical scenario, given two different run identities, must leave
 * every one of those byte-identical while the run name itself differs.
 */

function memIo(): StructuralIo & { files: Record<string, string> } {
  const files: Record<string, string> = {};
  return {
    files,
    readFile: (path) => files[path],
    writeFile: (path, content) => {
      files[path] = content;
    },
    mkdir: () => {},
    deleteFile: (path) => {
      delete files[path];
    },
  };
}

function buildTrace() {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
  ctx.enterMethod("OrderService", "placeOrder", [parameterCapture("orderId", '"order-42"', false)]);
  ctx.exitMethodWithReturn('"OK"');
  return ctx.captureTrace();
}

/** Runs `fn` under a fresh run identity fixed to `runId`, restoring nothing — callers reset after. */
function asRun<T>(runId: string, fn: () => T): { run: ReturnType<typeof runIdentity>; result: T } {
  resetRunIdentityForTest();
  process.env["NARRATIVETRACE_RUN_ID"] = runId;
  return { run: runIdentity(), result: fn() };
}

const RUN_A_ID = "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4";
const RUN_B_ID = "deadbeefdeadbeefdeadbeefdeadbeef";

describe("run-name byte identity (2026-09-13 ruling, item 3)", () => {
  afterEach(() => {
    resetRunIdentityForTest();
  });

  test("two runs with different ids produce byte-identical structural .nt and delta output", () => {
    const identity = artifactIdentityOfMethod("OrderServiceTest", "placesOrder");
    const scenario = structuralScenario(identity);
    const paths = structuralPaths(identity, "out", undefined);
    // The SAME captured trace reused for both "runs": two separate suite executions of the
    // identical scenario, not two randomly-generated traces (which would differ in trace_id and
    // duration for reasons that have nothing to do with the run name).
    const tree = buildTrace();

    // Each "run" starts from its own fresh (empty) io — no prior last-green baseline — the same
    // way two independent test-suite executions each see the scenario for the first time.
    const ioA = memIo();
    const { run: runA, result: resultA } = asRun(RUN_A_ID, () =>
      writeStructuralOutput(tree, scenario, paths, false, undefined, ioA),
    );

    const ioB = memIo();
    const { run: runB, result: resultB } = asRun(RUN_B_ID, () =>
      writeStructuralOutput(tree, scenario, paths, false, undefined, ioB),
    );

    // The run names genuinely differ — this is not a vacuous proof.
    expect(runA.name).not.toBe(runB.name);
    // ... yet the structural artifact and its delta against the (independent) last-green baseline
    // agree byte-for-byte.
    expect(ioA.files[paths.lastGreen]).toBeDefined();
    expect(ioB.files[paths.lastGreen]).toBe(ioA.files[paths.lastGreen]);
    expect(resultB.delta).toEqual(resultA.delta);
  });

  test("the Markdown artifact differs ONLY in its run: frontmatter line between two runs", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "run-name-byte-identity-"));
    try {
      const target = {
        outputDir: tmpDir,
        moduleName: "m",
        testName: "t",
        formats: ["md"] as const,
      };
      const file = join(tmpDir, "m", "t.md");
      // The SAME captured trace reused for both writes — see the structural test's own comment.
      const tree = buildTrace();

      const { run: runA } = asRun(RUN_A_ID, () => writeTraceOutput(tree, target));
      const contentA = readFileSync(file, "utf-8");

      const { run: runB } = asRun(RUN_B_ID, () => writeTraceOutput(tree, target));
      const contentB = readFileSync(file, "utf-8");

      expect(runA.name).not.toBe(runB.name);
      expect(contentA).toContain(`run: ${runA.name}`);
      expect(contentB).toContain(`run: ${runB.name}`);
      expect(contentA).not.toBe(contentB);

      const withoutRunLine = (doc: string) =>
        doc
          .split("\n")
          .filter((line) => !line.startsWith("run: "))
          .join("\n");
      expect(withoutRunLine(contentA)).toBe(withoutRunLine(contentB));
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
