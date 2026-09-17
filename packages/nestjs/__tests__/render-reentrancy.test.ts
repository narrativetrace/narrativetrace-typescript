// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  SyncNarrativeContext,
  type TraceEvent,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { NarrativeStorage } from "../src/narrative-storage.js";
import { wrapPrototypeMethods } from "../src/wrap-prototype.js";

// Cross-port check for a cross-runtime finding: value rendering must never re-enter tracing.
// wrapPrototypeMethods is the second NarrativeTrace TS tracing implementation (the first is
// packages/proxy's traceObject, covered by render-reentrancy.test.ts there) — it mutates a class
// PROTOTYPE directly rather than wrapping a Proxy, and wraps every own function-valued prototype
// property with no getter/toString/valueOf exemption list of its own. `renderSummary`
// (@narrativetrace/core's value-renderer.ts) calls a rendered value's `narrativeSummary()` member;
// when that value's class has been auto-wrapped, `narrativeSummary` IS a traced method — calling it
// during parameter/return capture must not open a span for a call the application never made.
function setup() {
  const events: TraceEvent[] = [];
  const pipeline = new DualPathPipeline((e) => events.push(e), new BufferedEventConsumer(64));
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
  const storage = new NarrativeStorage();
  return { events, ctx, storage };
}

// `Line` is declared fresh inside every test, not once at module scope: `wrapPrototypeMethods`
// marks each wrapped method with a `WRAPPED` symbol and skips re-wrapping it, so a SHARED class
// across tests would bind its wrapper closures to whichever test's `storage` wrapped it first —
// every later test's own (different) storage/context would then see an unwrapped-looking call.
function lineClass() {
  return class Line {
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
  };
}

type LineInstance = InstanceType<ReturnType<typeof lineClass>>;

describe("render reentrancy — wrapPrototypeMethods", () => {
  test("rendering a traced parameter's narrativeSummary produces no spurious span", () => {
    const { events, ctx, storage } = setup();
    const Line = lineClass();
    wrapPrototypeMethods(Line.prototype, "Line", storage);
    class LineService {
      receive(_line: LineInstance): string {
        return "received";
      }
    }
    wrapPrototypeMethods(LineService.prototype, "LineService", storage);
    const line = new Line("SKU-1", 3);
    const service = new LineService();

    const result = storage.run(ctx, () => service.receive(line));
    expect(result).toBe("received");

    const enters = events.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(1);
    if (enters[0]?.type === "enter") expect(enters[0].signature.methodName).toBe("receive");
  });

  test("the method body's own call to the parameter is still traced as a child", () => {
    const { events, ctx, storage } = setup();
    const Line = lineClass();
    wrapPrototypeMethods(Line.prototype, "Line", storage);
    class LineService {
      quantityOf(l: LineInstance): number {
        return l.quantity();
      }
    }
    wrapPrototypeMethods(LineService.prototype, "LineService", storage);
    const line = new Line("SKU-1", 3);
    const service = new LineService();

    const result = storage.run(ctx, () => service.quantityOf(line));
    expect(result).toBe(3);

    const enters = events.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(2);
    const names = enters.map((e) => (e.type === "enter" ? e.signature.methodName : undefined));
    expect(names).toEqual(["quantityOf", "quantity"]);
  });

  test("rendering a traced return value's narrativeSummary produces no spurious span", () => {
    const { events, ctx, storage } = setup();
    const Line = lineClass();
    wrapPrototypeMethods(Line.prototype, "Line", storage);
    class LineFactory {
      makeLine(): LineInstance {
        return new Line("SKU-1", 3);
      }
    }
    wrapPrototypeMethods(LineFactory.prototype, "LineFactory", storage);
    const factory = new LineFactory();

    const made = storage.run(ctx, () => factory.makeLine());
    expect(made.narrativeSummary()).toBe("SKU-1 x3");

    // makeLine's own enter, and nothing else — narrativeSummary() ran outside the storage.run
    // scope above (genuinely untraced, no ambient context), so it must not appear at all, and
    // certainly not as a render-triggered duplicate from inside makeLine's return capture.
    const enters = events.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(1);
    if (enters[0]?.type === "enter") expect(enters[0].signature.methodName).toBe("makeLine");
  });

  test("a throwing narrativeSummary during rendering leaves the guard cleared for the next genuine call", () => {
    const { events, ctx, storage } = setup();
    class ThrowingLine {
      narrativeSummary(): string {
        throw new Error("summary boom");
      }
    }
    wrapPrototypeMethods(ThrowingLine.prototype, "ThrowingLine", storage);
    class LineService {
      receive(_line: ThrowingLine): string {
        return "received";
      }
    }
    wrapPrototypeMethods(LineService.prototype, "LineService", storage);
    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }
    wrapPrototypeMethods(Calculator.prototype, "Calculator", storage);
    const throwingLine = new ThrowingLine();
    const service = new LineService();
    const calculator = new Calculator();

    storage.run(ctx, () => {
      expect(service.receive(throwingLine)).toBe("received");
      expect(calculator.add(2, 3)).toBe(5);
    });

    const enters = events.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(2);
    const names = enters.map((e) => (e.type === "enter" ? e.signature.methodName : undefined));
    expect(names).toEqual(["receive", "add"]);
  });
});
