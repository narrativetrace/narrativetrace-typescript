// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import { bench, describe } from "vitest";

class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  sum(items: number[]): number {
    let total = 0;
    for (const item of items) {
      total += item;
    }
    return total;
  }
}

describe("proxy overhead", () => {
  const calc = new Calculator();
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
  const traced = traceObject(calc, ctx, { add: ["a", "b"], sum: ["items"] });

  bench("direct call", () => {
    calc.add(1, 2);
  });

  bench("traced call (proxy)", () => {
    traced.add(1, 2);
  });

  bench("traced call with param names", () => {
    traced.add(3, 4);
  });
});

describe("proxy with parameter rendering", () => {
  const calc = new Calculator();
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
  const traced = traceObject(calc, ctx, { sum: ["items"] });

  const smallArray = [1, 2, 3];
  const largeArray = Array.from({ length: 100 }, (_, i) => i);

  bench("small array param", () => {
    traced.sum(smallArray);
  });

  bench("large array param (100 items)", () => {
    traced.sum(largeArray);
  });
});
