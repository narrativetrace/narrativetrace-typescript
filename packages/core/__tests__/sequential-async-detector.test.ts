// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { concurrencyInfo } from "../src/concurrency-info.js";
import { methodSignature } from "../src/method-signature.js";
import { analyze } from "../src/sequential-async-detector.js";
import { traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";

function member(start: number, duration: number) {
  const info = concurrencyInfo("g1", "Svc.op", "fork-join");
  return traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], duration, start, info);
}

describe("analyze", () => {
  test("returns isSequentialAsync false for overlapping tasks", () => {
    const members = [member(100, 50), member(110, 40)];
    const result = analyze(members);
    expect(result.isSequentialAsync).toBe(false);
  });

  test("returns isSequentialAsync true for non-overlapping tasks", () => {
    const members = [member(100, 50), member(200, 30)];
    const result = analyze(members);
    expect(result.isSequentialAsync).toBe(true);
  });

  test("computes totalMs as sum of durations", () => {
    const members = [member(100, 50), member(200, 30)];
    const result = analyze(members);
    expect(result.totalMs).toBe(80);
  });

  test("computes parallelizableMs as max duration", () => {
    const members = [member(100, 50), member(200, 30)];
    const result = analyze(members);
    expect(result.parallelizableMs).toBe(50);
  });
});
