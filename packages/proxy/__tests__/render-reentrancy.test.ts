// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { traceObject } from "../src/trace-object.js";

// Cross-port check for a cross-runtime finding (the same guard exists in every NarrativeTrace runtime;
// AgentRuntime.isActive, RenderReentrancyGuardTest.java): value rendering must never re-enter
// tracing. `renderSummary` (packages/core/src/value-renderer.ts) invokes a value's
// `narrativeSummary()` member while capturing a parameter or return value. When that value is
// itself a `traceObject`-wrapped instance, `narrativeSummary` is a wrapped method — calling it
// during rendering runs the SAME tracing wrapper that traces a genuine business call, opening a
// span for a call the application never made. This is the same defect Java found, one level
// removed: Java's woven accessor bytecode re-enters via reflection, TS's Proxy `get` trap
// re-enters via the same property lookup the renderer already performs.
describe("render reentrancy — traceObject", () => {
  class Line {
    constructor(
      private readonly sku: string,
      private readonly qty: number,
    ) {}
    narrativeSummary(): string {
      return `${this.sku} x${this.qty}`;
    }
    quantity(): number {
      return this.qty;
    }
  }

  function setup() {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const line = traceObject(new Line("SKU-1", 3), ctx);
    return { ctx, line };
  }

  test("rendering a traced parameter's narrativeSummary produces no spurious span", () => {
    const { ctx, line } = setup();
    class LineService {
      receive(_line: Line): string {
        return "received";
      }
    }
    const service = traceObject(new LineService(), ctx);

    expect(service.receive(line)).toBe("received");

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    const root = tree.roots[0];
    expect(root?.signature.methodName).toBe("receive");
    expect(root?.children).toHaveLength(0);
  });

  test("the method body's own call to the parameter is still traced as a child", () => {
    const { ctx, line } = setup();
    class LineService {
      quantityOf(l: Line): number {
        return l.quantity();
      }
    }
    const service = traceObject(new LineService(), ctx);

    expect(service.quantityOf(line)).toBe(3);

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    const root = tree.roots[0];
    expect(root?.signature.methodName).toBe("quantityOf");
    expect(root?.children).toHaveLength(1);
    expect(root?.children[0]?.signature.methodName).toBe("quantity");
    // narrativeSummary is never called by this method's own body — its render-triggered call
    // (for quantityOf's own parameter capture) must not leak into the child list either.
    expect(root?.children.map((c) => c.signature.methodName)).not.toContain("narrativeSummary");
  });

  test("rendering a traced return value's narrativeSummary produces no spurious span", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class LineFactory {
      makeLine(): Line {
        return traceObject(new Line("SKU-1", 3), ctx);
      }
    }
    const factory = traceObject(new LineFactory(), ctx);

    expect(factory.makeLine().narrativeSummary()).toBe("SKU-1 x3");

    const tree = ctx.captureTrace();
    // makeLine's own span, and the ONE genuine narrativeSummary() call the line above makes on
    // the returned value (outside any rendering — makeLine has already exited by then) — never a
    // second, render-triggered one nested under makeLine from capturing its own return value.
    expect(tree.roots).toHaveLength(2);
    expect(tree.roots.map((r) => r.signature.methodName)).toEqual(["makeLine", "narrativeSummary"]);
    const root = tree.roots[0];
    expect(root?.signature.methodName).toBe("makeLine");
    expect(root?.children).toHaveLength(0);
  });

  test("a throwing narrativeSummary during rendering leaves the guard cleared for the next genuine call", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class ThrowingLine {
      narrativeSummary(): string {
        throw new Error("summary boom");
      }
    }
    const throwingLine = traceObject(new ThrowingLine(), ctx);
    class LineService {
      receive(_line: ThrowingLine): string {
        return "received";
      }
    }
    const service = traceObject(new LineService(), ctx);
    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }
    const calculator = traceObject(new Calculator(), ctx);

    expect(service.receive(throwingLine)).toBe("received");
    expect(calculator.add(2, 3)).toBe(5);

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(2);
    expect(tree.roots.map((r) => r.signature.methodName)).toEqual(["receive", "add"]);
    expect(tree.roots[0]?.children).toHaveLength(0);
    expect(tree.roots[1]?.children).toHaveLength(0);
  });
});
