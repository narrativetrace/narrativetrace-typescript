// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  NarrativeTraceConfig,
  renderIndentedText,
  SyncNarrativeContext,
} from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { expect, test } from "vitest";
import { Calculator } from "../src/calculator.js";

function createTracedCalculator() {
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
  const calc = traceObject(new Calculator(), ctx);
  return { calc, ctx };
}

test("traced Calculator.add produces trace node", () => {
  const { calc, ctx } = createTracedCalculator();
  calc.add(2, 3);
  const trace = ctx.captureTrace();
  expect(trace.roots).toHaveLength(1);
  expect(trace.roots[0]?.signature.className).toBe("Calculator");
  expect(trace.roots[0]?.signature.methodName).toBe("add");
});

test("traced Calculator captures multiple method calls", () => {
  const { calc, ctx } = createTracedCalculator();
  calc.add(2, 3);
  calc.divide(10, 2);
  const trace = ctx.captureTrace();
  expect(trace.roots).toHaveLength(2);
});

test("traced Calculator returns correct values through proxy", () => {
  const { calc } = createTracedCalculator();
  expect(calc.add(2, 3)).toBe(5);
  expect(calc.divide(10, 2)).toBe(5);
});

test("renderIndentedText works with SyncNarrativeContext trace", () => {
  const { calc, ctx } = createTracedCalculator();
  calc.add(2, 3);
  calc.divide(10, 2);
  const trace = ctx.captureTrace();
  const output = renderIndentedText(trace);
  expect(output.length).toBeGreaterThan(0);
  expect(output).toContain("Calculator");
});
