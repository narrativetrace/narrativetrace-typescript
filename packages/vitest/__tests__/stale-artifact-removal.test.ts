// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  methodSignature,
  returned,
  type TraceTree,
  traceNode,
  traceTree,
} from "@narrativetrace/core-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TraceFormat, writeTraceOutput } from "../src/index.js";

function tree(): TraceTree {
  return traceTree([traceNode(methodSignature("A", "b", []), returned('"OK"'), [], 1)]);
}

describe("writeTraceOutput removes the same test's artifacts of formats this run does not write", () => {
  let dir: string;
  const run = (testName: string, formats: TraceFormat[]) =>
    writeTraceOutput(tree(), { outputDir: dir, moduleName: "M", testName, formats });
  const has = (path: string) => existsSync(join(dir, path));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-stale-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("a format switch leaves only the new format's file on disk (B-224)", () => {
    run("t", ["md", "json", "mmd", "puml", "clarity-json"]);
    const artifacts = run("t", ["json"]);
    expect([...artifacts.keys()]).toEqual(["json"]);
    expect(has("M/t.md")).toBe(false);
    expect(has("diagrams/M/t.mmd")).toBe(false);
    expect(has("diagrams/M/t.puml")).toBe(false);
    expect(has("M/t.clarity-json")).toBe(false);
    expect(has("M/t.json")).toBe(true);
  });

  test("canonical JSON on, then off: the earlier run's file is gone (B-227)", () => {
    run("t", ["md", "canonical-json"]);
    expect(has("M/t.canonical.json")).toBe(true);
    run("t", ["md"]);
    expect(has("M/t.canonical.json")).toBe(false);
  });

  test("a run with canonical JSON on still writes and lists it (B-227 pin)", () => {
    run("t", ["md"]);
    const artifacts = run("t", ["md", "canonical-json"]);
    expect(artifacts.get("canonicalJson")).toBe("M/t.canonical.json");
    expect(has("M/t.canonical.json")).toBe(true);
  });

  test("a sibling test sharing the name prefix keeps its artifacts", () => {
    run("t2", ["md", "mmd"]);
    run("t", ["json"]);
    expect(has("M/t2.md")).toBe(true);
    expect(has("diagrams/M/t2.mmd")).toBe(true);
  });

  test("approval baselines and the unknown files beside the trace survive", () => {
    mkdirSync(join(dir, "M"), { recursive: true });
    for (const name of ["t.approved.nt", "t.received.nt", "t.notes.txt"]) {
      writeFileSync(join(dir, "M", name), "x");
    }
    run("t", ["json"]);
    expect(has("M/t.approved.nt") && has("M/t.received.nt") && has("M/t.notes.txt")).toBe(true);
  });

  test("an empty trace removes nothing", () => {
    run("t", ["md"]);
    writeTraceOutput(traceTree([]), {
      outputDir: dir,
      moduleName: "M",
      testName: "t",
      formats: [],
    });
    expect(has("M/t.md")).toBe(true);
  });
});
