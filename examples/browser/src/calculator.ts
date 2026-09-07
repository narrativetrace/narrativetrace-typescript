// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The object under trace in the demo.
 *
 * Deliberately tiny so the trace, not the code, is the point: `add` and `divide` succeed,
 * `divide(x, 0)` throws — which is how the demo gets a failed call (`✗`) into the trace.
 * NarrativeTrace never sees this class directly; `traceObject` wraps an instance in an ES Proxy
 * that records every method call, its arguments, and its return value or thrown error.
 */
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  divide(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero");
    return a / b;
  }
}
