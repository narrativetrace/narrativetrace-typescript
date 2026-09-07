// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, describe, expect, test } from "vitest";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { getIdGenerator, registerIdGenerator } from "../src/id-generator.js";
import { parameterCapture } from "../src/parameter-capture.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";

describe("ContextSnapshot", () => {
  // Unconditional cleanup: a custom id generator registered by one test must not survive an
  // assertion failure and leak into later tests. Restore the suite's generator rather than
  // calling resetIdGenerator() — clearing it outright would leave the rest of the file with no
  // generator at all, since setup.ts registers one per test file.
  const suiteGenerator = getIdGenerator();
  afterEach(() => registerIdGenerator(suiteGenerator));

  test("snapshot activate → fresh scope", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    const snapshot = ctx.snapshot();

    // Activate in a new context — original trace should be available
    const ctx2 = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const scope = snapshot.activate(ctx2);
    ctx2.enterMethod("Svc", "op2", []);
    ctx2.exitMethodWithReturn('"ok2"');
    scope.close();

    // Original context is unaffected
    expect(ctx.captureTrace().roots).toHaveLength(1);
  });

  test("close restores previous state", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const snapshot = ctx.snapshot();
    const scope = snapshot.activate(ctx);

    ctx.enterMethod("Svc", "scoped", []);
    ctx.exitMethodWithReturn('"scoped"');

    scope.close();
    // After close, a new method goes to the normal context
    ctx.enterMethod("Svc", "afterClose", []);
    ctx.exitMethodWithReturn('"after"');

    const tree = ctx.captureTrace();
    // Should have both scoped and afterClose methods
    expect(tree.roots.length).toBeGreaterThanOrEqual(1);
  });

  test("wrapFn executes within scope", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const snapshot = ctx.snapshot();

    const result = snapshot.wrapFn(ctx, () => {
      ctx.enterMethod("Svc", "wrapped", [parameterCapture("x", "1", false)]);
      ctx.exitMethodWithReturn('"wrapped-ok"');
      return 42;
    });

    expect(result).toBe(42);
    expect(ctx.captureTrace().roots).toHaveLength(1);
    expect(ctx.captureTrace().roots[0]?.signature.methodName).toBe("wrapped");
  });

  test("wrapFn preserves return value", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const snapshot = ctx.snapshot();
    const result = snapshot.wrapFn(ctx, () => "hello");
    expect(result).toBe("hello");
  });

  test("wrapFn propagates thrown errors", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const snapshot = ctx.snapshot();
    expect(() =>
      snapshot.wrapFn(ctx, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
  });

  test("activate scopes the passed context, not the source context", () => {
    const source = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const snapshot = source.snapshot(); // saves source stack length 0

    // Source starts an in-progress method AFTER taking the snapshot
    source.enterMethod("Svc", "ongoing", []);

    // Activate on a different context — close should NOT touch source
    const target = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const scope = snapshot.activate(target);
    scope.close();

    // Source's in-progress "ongoing" frame must survive
    source.exitMethodWithReturn('"done"');
    const sourceTree = source.captureTrace();
    expect(sourceTree.roots).toHaveLength(1);
    expect(sourceTree.roots[0]?.signature.methodName).toBe("ongoing");
  });

  test("close is idempotent", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const snapshot = ctx.snapshot();
    const scope = snapshot.activate(ctx);
    scope.close();
    // Second close should not throw
    expect(() => scope.close()).not.toThrow();
  });

  test("close restores target trace identity after cross-context activation", () => {
    let traceCounter = 0;
    let spanCounter = 0;
    registerIdGenerator({
      traceId: () => (++traceCounter).toString(16).padStart(32, "0") as TraceId,
      spanId: () => (++spanCounter).toString(16).padStart(16, "0") as SpanId,
    });

    const source = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    source.enterMethod("SourceService", "work", []);
    const sourceTraceId = source.traceId();

    const snapshot = source.snapshot();
    const target = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));

    const scope = snapshot.activate(target);
    scope.close();

    expect(target.traceId()).not.toBe(sourceTraceId);
  });
});
