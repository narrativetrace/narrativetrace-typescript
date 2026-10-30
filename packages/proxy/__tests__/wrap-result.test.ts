// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext, type TraceNode } from "@narrativetrace/core";
import { beforeEach, describe, expect, test } from "vitest";
import { traceObject } from "../src/index.js";

class Catalog {
  find(sku: string): { sku: string } {
    return { sku };
  }
  fail(): never {
    throw new Error("out of stock");
  }
}

function onlyRoot(ctx: SyncNarrativeContext): TraceNode {
  const roots = ctx.captureTrace().roots;
  expect(roots).toHaveLength(1);
  return roots[0] as TraceNode;
}

describe("ProxyOptions.wrapResult", () => {
  let ctx: SyncNarrativeContext;

  beforeEach(() => {
    ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
  });

  test("runs while the method's own span is the open span, and the caller receives what it returns", () => {
    const seen: (string | null)[] = [];
    const traced = traceObject(new Catalog(), ctx, undefined, {
      wrapResult: (result) => {
        seen.push(ctx.activeSpanId);
        return { wrapped: result };
      },
    });

    const result = traced.find("A1");

    expect(result).toEqual({ wrapped: { sku: "A1" } });
    expect(seen).toEqual([onlyRoot(ctx).spanContext?.spanId]);
  });

  test("the span records the method's own result, not the replacement", () => {
    const traced = traceObject(new Catalog(), ctx, undefined, { wrapResult: () => "replaced" });

    traced.find("A1");

    const outcome = onlyRoot(ctx).outcome;
    expect(outcome.kind === "returned" && outcome.renderedValue).toContain("A1");
  });

  test("a throwing wrapResult leaves the caller the method's own result and the span closed", () => {
    const traced = traceObject(new Catalog(), ctx, undefined, {
      wrapResult: () => {
        throw new Error("hook failed");
      },
    });

    expect(traced.find("A1")).toEqual({ sku: "A1" });
    expect(onlyRoot(ctx).outcome.kind).toBe("returned");
    expect(ctx.activeSpanId).toBeNull();
  });

  test("is not called when the method throws", () => {
    let calls = 0;
    const traced = traceObject(new Catalog(), ctx, undefined, {
      wrapResult: (r) => {
        calls++;
        return r;
      },
    });

    expect(() => traced.fail()).toThrow("out of stock");
    expect(calls).toBe(0);
  });

  test("is not called when tracing is off", () => {
    const off = new SyncNarrativeContext(new NarrativeTraceConfig("off"));
    let calls = 0;
    const traced = traceObject(new Catalog(), off, undefined, {
      wrapResult: (r) => {
        calls++;
        return r;
      },
    });

    expect(traced.find("A1")).toEqual({ sku: "A1" });
    expect(calls).toBe(0);
  });

  test("a wrapResult that is not a function is rejected when the object is wrapped", () => {
    expect(() =>
      traceObject(new Catalog(), ctx, undefined, { wrapResult: "nope" as never }),
    ).toThrow(TypeError);
  });
});
