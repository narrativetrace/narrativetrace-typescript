// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "../src/branded-types.js";
import { BufferedEventConsumer } from "../src/buffered-event-consumer.js";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { DualPathPipeline } from "../src/dual-path-pipeline.js";
import { NOOP_CONTEXT } from "../src/noop-context.js";
import { parameterCapture } from "../src/parameter-capture.js";
import type { ServiceIdentity } from "../src/service-identity.js";
import { isValidTraceId, type SpanId } from "../src/span-id-generator.js";
import type { TraceEvent } from "../src/trace-event.js";

function makeContext(level: "off" | "errors" | "summary" | "narrative" | "detail" = "detail") {
  return new SyncNarrativeContext(new NarrativeTraceConfig(level));
}

describe("SyncNarrativeContext", () => {
  test("enter/exit single method → one root", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op", [parameterCapture("id", '"42"', false)]);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.className).toBe("Svc");
    expect(tree.roots[0]?.signature.methodName).toBe("op");
    expect(tree.roots[0]?.outcome.kind).toBe("returned");
  });

  test("nested enter/exit → child nodes", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op", []);
    ctx.enterMethod("Repo", "find", []);
    ctx.exitMethodWithReturn('"found"');
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.signature.className).toBe("Repo");
  });

  test("exit with exception → threw outcome", () => {
    const ctx = makeContext();
    const err = new Error("boom");
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithException(err);
    const tree = ctx.captureTrace();
    const root = tree.roots[0];
    expect(root?.outcome.kind).toBe("threw");
    if (root?.outcome.kind === "threw") {
      expect(root.outcome.error).toBe(err);
    }
  });

  test("captures duration > 0", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op", []);
    // Burn some time
    const start = performance.now();
    while (performance.now() - start < 1) {
      // spin
    }
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.durationMs).toBeGreaterThan(0);
  });

  test("reset clears all state", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    ctx.reset();
    const tree = ctx.captureTrace();
    expect(tree.isEmpty).toBe(true);
  });

  test("detail: preserves parameter values", () => {
    const ctx = makeContext("detail");
    ctx.enterMethod("Svc", "op", [parameterCapture("id", '"42"', false)]);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.signature.parameters[0]?.renderedValue).toBe('"42"');
  });

  test("narrative: suppresses param values (empty strings)", () => {
    const ctx = makeContext("narrative");
    ctx.enterMethod("Svc", "op", [parameterCapture("id", '"42"', false)]);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.signature.parameters[0]?.renderedValue).toBe("");
  });

  test("summary: captures root-level calls", () => {
    const ctx = makeContext("summary");
    ctx.enterMethod("Svc", "op", []);
    ctx.enterMethod("Repo", "find", []);
    ctx.exitMethodWithReturn('"found"');
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    // summary captures all calls (filtering is a renderer concern)
    expect(tree.roots).toHaveLength(1);
  });

  test("errors: only exception paths", () => {
    const ctx = makeContext("errors");
    // Successful call — should not be captured
    ctx.enterMethod("Svc", "ok", []);
    ctx.exitMethodWithReturn('"ok"');
    // Failed call — should be captured
    ctx.enterMethod("Svc", "fail", []);
    ctx.exitMethodWithException(new Error("boom"));
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.methodName).toBe("fail");
  });

  test("isActive true when level != off", () => {
    const ctx = makeContext("narrative");
    expect(ctx.isActive).toBe(true);
  });

  test("isActive false when level == off", () => {
    const ctx = makeContext("off");
    expect(ctx.isActive).toBe(false);
  });

  test("multiple sequential roots", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op1", []);
    ctx.exitMethodWithReturn('"a"');
    ctx.enterMethod("Svc", "op2", []);
    ctx.exitMethodWithReturn('"b"');
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(2);
    expect(tree.roots[0]?.signature.methodName).toBe("op1");
    expect(tree.roots[1]?.signature.methodName).toBe("op2");
  });

  test("off: captures nothing", () => {
    const ctx = makeContext("off");
    ctx.enterMethod("Svc", "op", [parameterCapture("id", '"42"', false)]);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.isEmpty).toBe(true);
  });

  test("errorContext flows to signature on exception", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op", [], { errorContext: "failed during op" });
    ctx.exitMethodWithException(new Error("boom"));
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.signature.errorContext).toBe("failed during op");
  });

  test("off: exitMethodWithException is a no-op", () => {
    const ctx = makeContext("off");
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithException(new Error("boom"));
    const tree = ctx.captureTrace();
    expect(tree.isEmpty).toBe(true);
  });

  test("exitMethodWithReturn on empty stack is a no-op", () => {
    const ctx = makeContext();
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.isEmpty).toBe(true);
  });

  test("populates startTimeMs from frame", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.startTimeMs).toBeGreaterThan(0);
  });

  test("startTimeMs increases across sequential calls", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op1", []);
    ctx.exitMethodWithReturn('"a"');
    ctx.enterMethod("Svc", "op2", []);
    ctx.exitMethodWithReturn('"b"');
    const tree = ctx.captureTrace();
    const t1 = tree.roots[0]?.startTimeMs ?? 0;
    const t2 = tree.roots[1]?.startTimeMs ?? 0;
    expect(t2).toBeGreaterThanOrEqual(t1);
  });

  test("snapshot.activate falls back to self when given non-SyncNarrativeContext", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "op", []);
    const snap = ctx.snapshot();
    const scope = snap.activate(NOOP_CONTEXT);
    scope.close();
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
  });

  test("enterMethod returns unique spanId strings", () => {
    const ctx = makeContext();
    const h0 = ctx.enterMethod("Svc", "a", []);
    const h1 = ctx.enterMethod("Svc", "b", []);
    expect(h0).toMatch(/^[0-9a-f]{16}$/);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(h0).not.toBe(h1);
    ctx.exitMethodWithReturn(null);
    ctx.exitMethodWithReturn(null);
  });

  test("enterMethod returns empty string when level is off", () => {
    const ctx = makeContext("off");
    const h = ctx.enterMethod("Svc", "op", []);
    expect(h).toBe("");
  });

  test("exitMethodWithReturn with handle completes correct frame out-of-order", () => {
    const ctx = makeContext();
    const h0 = ctx.enterMethod("Svc", "outer", []);
    const h1 = ctx.enterMethod("Svc", "inner", []);
    // Exit outer (h0) first — NOT LIFO order
    ctx.exitMethodWithReturn('"outer-val"', h0);
    ctx.exitMethodWithReturn('"inner-val"', h1);
    const tree = ctx.captureTrace();
    // inner was entered inside outer's scope (parentHandle=h0), so it stays
    // as a child of outer regardless of exit order — the event trail preserves
    // the actual call relationship.
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("outer");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("inner");
  });

  test("exitMethodWithReturn without handle uses LIFO", () => {
    const ctx = makeContext();
    ctx.enterMethod("Svc", "a", []);
    ctx.enterMethod("Svc", "b", []);
    ctx.exitMethodWithReturn('"b-val"');
    ctx.exitMethodWithReturn('"a-val"');
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.methodName).toBe("a");
    expect(tree.roots[0]?.children[0]?.signature.methodName).toBe("b");
  });

  test("exitMethodWithException with handle completes correct frame", () => {
    const ctx = makeContext();
    const h0 = ctx.enterMethod("Svc", "outer", []);
    const h1 = ctx.enterMethod("Svc", "inner", []);
    ctx.exitMethodWithException(new Error("inner-err"), h1);
    ctx.exitMethodWithReturn('"ok"', h0);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.outcome.kind).toBe("threw");
  });

  test("detachFrame removes frame from active call chain", () => {
    const ctx = makeContext();
    const h = ctx.enterMethod("Svc", "async", []);
    ctx.detachFrame(h);
    // New enter should NOT nest under the detached frame
    ctx.enterMethod("Svc", "next", []);
    ctx.exitMethodWithReturn('"next-val"');
    ctx.exitMethodWithReturn('"async-val"', h);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(2);
    const names = tree.roots.map((r) => r.signature.methodName);
    expect(names).toContain("async");
    expect(names).toContain("next");
  });

  test("detached frame can be completed later with handle", () => {
    const ctx = makeContext();
    const h = ctx.enterMethod("Svc", "slow", []);
    ctx.detachFrame(h);
    ctx.exitMethodWithReturn('"slow-val"', h);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.methodName).toBe("slow");
    expect(tree.roots[0]?.outcome.kind === "returned" && tree.roots[0].outcome.renderedValue).toBe(
      '"slow-val"',
    );
  });

  test("detached frame children accumulated before detach are preserved", () => {
    const ctx = makeContext();
    const h = ctx.enterMethod("Svc", "parent", []);
    ctx.enterMethod("Repo", "child", []);
    ctx.exitMethodWithReturn('"found"');
    ctx.detachFrame(h);
    ctx.exitMethodWithReturn('"parent-val"', h);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.signature.methodName).toBe("child");
  });

  test("two overlapping detach/complete produce sibling roots", () => {
    const ctx = makeContext();
    // Simulate: fast() enters, slow() enters, fast detaches, slow detaches
    const hFast = ctx.enterMethod("Svc", "fast", []);
    ctx.detachFrame(hFast);
    const hSlow = ctx.enterMethod("Svc", "slow", []);
    ctx.detachFrame(hSlow);
    // Fast resolves first
    ctx.exitMethodWithReturn('"fast-result"', hFast);
    // Slow resolves later
    ctx.exitMethodWithReturn('"slow-result"', hSlow);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(2);
    const fast = tree.roots.find((r) => r.signature.methodName === "fast");
    const slow = tree.roots.find((r) => r.signature.methodName === "slow");
    expect(fast?.outcome.kind === "returned" && fast.outcome.renderedValue).toBe('"fast-result"');
    expect(slow?.outcome.kind === "returned" && slow.outcome.renderedValue).toBe('"slow-result"');
  });

  test("overlapping calls with shared parent attach to correct parent", () => {
    const ctx = makeContext();
    const hParent = ctx.enterMethod("Svc", "parent", []);
    // Two async children
    const hA = ctx.enterMethod("Repo", "fetchA", []);
    ctx.detachFrame(hA);
    const hB = ctx.enterMethod("Repo", "fetchB", []);
    ctx.detachFrame(hB);
    // Both complete
    ctx.exitMethodWithReturn('"a"', hA);
    ctx.exitMethodWithReturn('"b"', hB);
    ctx.exitMethodWithReturn('"done"', hParent);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children).toHaveLength(2);
    const childNames = tree.roots[0]?.children.map((c) => c.signature.methodName);
    expect(childNames).toContain("fetchA");
    expect(childNames).toContain("fetchB");
  });

  test("completed frame whose parent already exited stays as child", () => {
    const ctx = makeContext();
    const hParent = ctx.enterMethod("Svc", "parent", []);
    const hChild = ctx.enterMethod("Repo", "orphan", []);
    ctx.detachFrame(hChild);
    // Parent exits before child
    ctx.exitMethodWithReturn('"parent-done"', hParent);
    // Child resolves after parent is gone — but the event trail preserves
    // the parent-child relationship via parentHandle, so child stays nested.
    ctx.exitMethodWithReturn('"orphan-done"', hChild);
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("parent");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("orphan");
  });

  test("parentResolver takes priority over activeStack", () => {
    let scopeHandle: SpanId | undefined;
    const resolver = () => scopeHandle;
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), resolver);
    const hOuter = ctx.enterMethod("Svc", "outer", []);
    scopeHandle = hOuter;
    // activeStack has hOuter on top, but resolver also returns hOuter — same result.
    // Enter inner while resolver is active:
    ctx.enterMethod("Svc", "inner", []);
    ctx.exitMethodWithReturn('"inner-val"');
    ctx.exitMethodWithReturn('"outer-val"');
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("inner");
  });

  test("parentResolver overrides activeStack when they differ", () => {
    let scopeHandle: SpanId | undefined;
    const resolver = () => scopeHandle;
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), resolver);
    const hA = ctx.enterMethod("Svc", "a", []);
    ctx.exitMethodWithReturn('"a-val"');
    const _hB = ctx.enterMethod("Svc", "b", []);
    // Resolver says parent is hA, but activeStack has hB on top
    scopeHandle = hA;
    ctx.enterMethod("Svc", "child", []);
    ctx.exitMethodWithReturn('"child-val"');
    scopeHandle = undefined;
    ctx.exitMethodWithReturn('"b-val"');
    const tree = ctx.captureTrace();
    // child should be under "a" (resolver wins), not "b" (activeStack)
    const a = tree.roots.find((r) => r.signature.methodName === "a");
    expect(a?.children).toHaveLength(1);
    expect(a?.children[0].signature.methodName).toBe("child");
  });

  test("runScoped is identity — returns fn result", () => {
    const ctx = makeContext();
    const result = ctx.runScoped("" as SpanId, () => "hello");
    expect(result).toBe("hello");
  });

  test("exitMethodWithException on empty stack is a no-op", () => {
    const ctx = makeContext();
    ctx.exitMethodWithException(new Error("stray"));
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(0);
  });

  test("parentOf returns null for root entry", () => {
    const ctx = makeContext();
    const h = ctx.enterMethod("Svc", "op", []);
    expect(ctx.parentOf(h)).toBeNull();
    ctx.exitMethodWithReturn(null);
  });

  test("parentOf returns parent handle for nested entry", () => {
    const ctx = makeContext();
    const hOuter = ctx.enterMethod("Outer", "run", []);
    const hInner = ctx.enterMethod("Inner", "exec", []);
    expect(ctx.parentOf(hInner)).toBe(hOuter);
    ctx.exitMethodWithReturn(null);
    ctx.exitMethodWithReturn(null);
  });

  test("parentOf returns null for unknown spanId", () => {
    const ctx = makeContext();
    expect(ctx.parentOf("aaaaaaaaaaaaaaaa" as SpanId)).toBeNull();
  });

  test("publishes enter events to provided pipeline", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(8));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("Svc", "op", []);
    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("enter");
  });

  test("publishes exit events to provided pipeline", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(8));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    expect(received).toHaveLength(2);
    expect(received[1]?.type).toBe("exit");
  });

  test("reset clears pipeline events", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(8));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    ctx.reset();
    pipeline.flush();
    expect(pipeline.events()).toHaveLength(0);
  });

  test("captureTrace filters events to own handles when sharing a pipeline", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const ctx1 = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    const ctx2 = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx1.enterMethod("Svc1", "a", []);
    ctx2.enterMethod("Svc2", "b", []);
    ctx1.exitMethodWithReturn('"1"');
    ctx2.exitMethodWithReturn('"2"');
    const tree1 = ctx1.captureTrace();
    expect(tree1.roots).toHaveLength(1);
    expect(tree1.roots[0]?.signature.className).toBe("Svc1");
  });

  test("reset() drops only its own spans, not a concurrent context's events", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const ctxA = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    const ctxB = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctxA.enterMethod("SvcA", "a", []);
    ctxB.enterMethod("SvcB", "b", []);
    ctxA.exitMethodWithReturn('"a"');
    ctxB.exitMethodWithReturn('"b"');

    ctxA.reset();

    const treeB = ctxB.captureTrace();
    expect(treeB.roots).toHaveLength(1);
    expect(treeB.roots[0]?.signature.className).toBe("SvcB");
  });

  // Bug-hunt no-poison contract: reset() cleared only knownSpanIds()
  // (this context's own spans) — a finished async child's already-adopted spans/events stayed
  // in the shared pipeline for the life of the process, once per request, in exactly the
  // long-running singleton this contract exists for.
  test("reset() also drops spans already adopted from a finished async child", () => {
    const pipeline = new DualPathPipeline(null, new BufferedEventConsumer(64));
    const parent = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    const worker = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
    );
    worker.exitMethodWithReturn('"ok"', worker.enterMethod("Worker", "task", []));
    parent.adopt(worker.reportableSpanIds());

    parent.reset();
    pipeline.flush();

    expect(pipeline.events()).toHaveLength(0);
  });
});

describe("ServiceIdentity stamping", () => {
  const identity: ServiceIdentity = {
    serviceName: "order-service",
    serviceVersion: "2.1.0",
    environment: "staging",
  };

  test("enter event carries all service identity fields", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      null,
      identity,
    );
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');

    const enter = received.find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.serviceName).toBe("order-service");
    expect(enter?.type === "enter" && enter.spanContext.serviceVersion).toBe("2.1.0");
    expect(enter?.type === "enter" && enter.spanContext.environment).toBe("staging");
  });

  test("exit event carries same service identity as enter", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      null,
      identity,
    );
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');

    const exit = received.find((e) => e.type === "exit");
    expect(exit?.type === "exit" && exit.spanContext.serviceName).toBe("order-service");
  });

  test("partial service identity only stamps provided fields", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      null,
      { serviceName: "auth-service" },
    );
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');

    const enter = received.find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.serviceName).toBe("auth-service");
    expect(enter?.type === "enter" && enter.spanContext.serviceVersion).toBeUndefined();
    expect(enter?.type === "enter" && enter.spanContext.environment).toBeUndefined();
  });

  test("no service identity omits optional fields from SpanContext", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');

    const enter = received.find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.serviceName).toBeUndefined();
  });

  test("nested calls share the same service identity", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(
      new NarrativeTraceConfig("detail"),
      undefined,
      pipeline,
      null,
      identity,
    );
    ctx.enterMethod("Svc", "outer", []);
    ctx.enterMethod("Repo", "inner", []);
    ctx.exitMethodWithReturn('"found"');
    ctx.exitMethodWithReturn('"ok"');

    const enters = received.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(2);
    for (const e of enters) {
      if (e.type === "enter") {
        expect(e.spanContext.serviceName).toBe("order-service");
      }
    }
  });

  test("traceId() eagerly generates a valid trace id before enterMethod", () => {
    const ctx = makeContext();
    const id = ctx.traceId();
    expect(isValidTraceId(id)).toBe(true);
  });

  test("traceId() returns the same value on repeated calls", () => {
    const ctx = makeContext();
    const first = ctx.traceId();
    const second = ctx.traceId();
    expect(second).toBe(first);
  });

  test("traceId() matches SpanContext traceId on spans", () => {
    const ctx = makeContext();
    const id = ctx.traceId();
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const tree = ctx.captureTrace();
    expect(tree.roots[0]?.spanContext?.traceId).toBe(id);
  });

  test("reset() causes traceId() to generate a new value", () => {
    const ctx = makeContext();
    const first = ctx.traceId();
    ctx.reset();
    const second = ctx.traceId();
    expect(second).not.toBe(first);
    expect(isValidTraceId(second)).toBe(true);
  });

  test("setRequestContext() stamps HTTP fields on subsequent spans", () => {
    const ctx = makeContext();
    ctx.setRequestContext("POST", "/api/orders" as HttpRoute, "10.0.0.1" as ClientIp);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const tree = ctx.captureTrace();
    const sc = tree.roots[0]?.spanContext;
    expect(sc?.httpMethod).toBe("POST");
    expect(sc?.httpRoute).toBe("/api/orders");
    expect(sc?.clientIp).toBe("10.0.0.1");
  });

  test("setUserContext() stamps identity fields on subsequent spans", () => {
    const ctx = makeContext();
    ctx.setUserContext("user-42" as EnduserId, "sess-abc" as SessionId, "tenant-1" as TenantId);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const tree = ctx.captureTrace();
    const sc = tree.roots[0]?.spanContext;
    expect(sc?.enduserId).toBe("user-42");
    expect(sc?.sessionId).toBe("sess-abc");
    expect(sc?.tenantId).toBe("tenant-1");
  });

  test("storyId derived from first root-level enterMethod", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn(null);
    const enter = received.find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.storyId).toBe("OrderService.placeOrder");
  });

  test("chapterId derived from first root-level enterMethod", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn(null);
    const enter = received.find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.chapterId).toBe("OrderService.placeOrder");
  });

  test("storyId propagates to nested spans", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.enterMethod("PaymentService", "charge", []);
    ctx.exitMethodWithReturn(null);
    ctx.exitMethodWithReturn(null);
    const enters = received.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(2);
    for (const e of enters) {
      if (e.type === "enter") {
        expect(e.spanContext.storyId).toBe("OrderService.placeOrder");
      }
    }
  });

  test("storyId not reset by second root-level enter", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn(null);
    ctx.enterMethod("ShippingService", "ship", []);
    ctx.exitMethodWithReturn(null);
    const enters = received.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(2);
    // storyId stays as the first root method
    for (const e of enters) {
      if (e.type === "enter") {
        expect(e.spanContext.storyId).toBe("OrderService.placeOrder");
      }
    }
  });

  test("reset clears storyId and chapterId", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn(null);
    ctx.reset();
    ctx.enterMethod("ShippingService", "ship", []);
    ctx.exitMethodWithReturn(null);
    pipeline.flush();
    const enters = pipeline.events().filter((e) => e.type === "enter");
    // After reset, the new root derives a fresh storyId
    expect(enters).toHaveLength(1);
    const enter = enters[0];
    expect(enter?.type === "enter" && enter.spanContext.storyId).toBe("ShippingService.ship");
  });

  test("storyId() returns null before first enterMethod", () => {
    const ctx = makeContext();
    expect(ctx.storyId).toBeNull();
  });

  test("storyId() returns derived value after enterMethod", () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "placeOrder", []);
    expect(ctx.storyId).toBe("OrderService.placeOrder");
    ctx.exitMethodWithReturn(null);
  });

  test("chapterId() returns derived value after enterMethod", () => {
    const ctx = makeContext();
    ctx.enterMethod("OrderService", "placeOrder", []);
    expect(ctx.chapterId).toBe("OrderService.placeOrder");
    ctx.exitMethodWithReturn(null);
  });

  test("run() executes the function and returns its result", () => {
    const ctx = makeContext();
    const result = ctx.run(() => 42);
    expect(result).toBe(42);
  });

  test("reset() clears request and user context", () => {
    const ctx = makeContext();
    ctx.setRequestContext("POST", "/api/orders" as HttpRoute, "10.0.0.1" as ClientIp);
    ctx.setUserContext("user-42" as EnduserId);
    ctx.reset();
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const tree = ctx.captureTrace();
    const sc = tree.roots[0]?.spanContext;
    expect(sc?.httpMethod).toBeUndefined();
    expect(sc?.enduserId).toBeUndefined();
  });

  test("setUserContext with only sessionId omits enduserId and tenantId from span", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.setUserContext(undefined, "sess-99" as SessionId);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const enter = received.find((e) => e.type === "enter");
    const sc = enter?.type === "enter" ? enter.spanContext : undefined;
    expect(sc?.sessionId).toBe("sess-99");
    // Verify keys are truly absent, not just undefined
    expect(Object.keys(sc ?? {}).includes("enduserId")).toBe(false);
    expect(Object.keys(sc ?? {}).includes("tenantId")).toBe(false);
  });

  test("setUserContext with only tenantId omits enduserId and sessionId from span", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.setUserContext(undefined, undefined, "tenant-x" as TenantId);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const enter = received.find((e) => e.type === "enter");
    const sc = enter?.type === "enter" ? enter.spanContext : undefined;
    expect(sc?.tenantId).toBe("tenant-x");
    expect(Object.keys(sc ?? {}).includes("enduserId")).toBe(false);
    expect(Object.keys(sc ?? {}).includes("sessionId")).toBe(false);
  });

  test("exitMethodWithException on off-level emits nothing", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("off"), undefined, pipeline);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithException(new Error("ignored"));
    // off-level should not emit any events at all
    expect(received).toHaveLength(0);
  });

  test("exitMethodWithException on empty stack emits nothing", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    // No enterMethod — stack is empty
    ctx.exitMethodWithException(new Error("orphan"));
    expect(received.filter((e) => e.type === "exit")).toHaveLength(0);
  });

  test("exitMethodWithException with stale handle is a no-op", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    ctx.exitMethodWithException(new Error("stale"), "aaaaaaaaaaaaaaaa" as SpanId);
    // Only the enter from nothing — should not crash or emit exit
    expect(received.filter((e) => e.type === "exit")).toHaveLength(0);
  });

  test("detachFrame with unknown handle is a safe no-op", () => {
    const ctx = makeContext();
    ctx.detachFrame("aaaaaaaaaaaaaaaa" as SpanId);
    const tree = ctx.captureTrace();
    expect(tree.isEmpty).toBe(true);
  });

  test("exitMethodWithException with unknown handle is a no-op", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    // Use a handle that was never entered — no spanContext in map
    ctx.exitMethodWithException(new Error("unknown"), "bbbbbbbbbbbbbbbb" as SpanId);
    expect(received.filter((e) => e.type === "exit")).toHaveLength(0);
  });

  test("setSnapshotParent does not overwrite existing traceId", () => {
    const ctx = makeContext();
    const originalId = ctx.traceId();
    ctx.setSnapshotParent(
      "aaaaaaaaaaaaaaaa" as SpanId,
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as TraceId,
    );
    expect(ctx.traceId()).toBe(originalId);
  });

  test("setSnapshotParent sets traceId when none exists", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    const parentSpanId = "aaaaaaaaaaaaaaaa" as SpanId;
    const inheritedTraceId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as TraceId;
    ctx.setSnapshotParent(parentSpanId, inheritedTraceId);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    const enter = received.find((e) => e.type === "enter");
    expect(enter?.type === "enter" && enter.spanContext.traceId).toBe(inheritedTraceId);
    expect(enter?.type === "enter" && enter.spanContext.parentSpanId).toBe(parentSpanId);
  });

  test("exitMethodWithReturn with NOOP spanId from off-level is a no-op", () => {
    const received: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => received.push(e), new BufferedEventConsumer(16));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    // Simulate passing the empty NOOP_SPAN_ID that enterMethod returns when off
    ctx.exitMethodWithReturn('"val"', "" as SpanId);
    expect(received.filter((e) => e.type === "exit")).toHaveLength(0);
  });

  test("detachFrame only removes matching handle from active stack", () => {
    const ctx = makeContext();
    const h1 = ctx.enterMethod("Svc", "a", []);
    const h2 = ctx.enterMethod("Svc", "b", []);
    ctx.detachFrame(h1);
    // h2 should still be on the stack — next enter nests under it
    ctx.enterMethod("Svc", "c", []);
    ctx.exitMethodWithReturn(null);
    ctx.exitMethodWithReturn(null, h2);
    ctx.exitMethodWithReturn(null, h1);
    const tree = ctx.captureTrace();
    const b = tree.roots[0]?.children.find((c) => c.signature.methodName === "b");
    expect(b?.children).toHaveLength(1);
    expect(b?.children[0]?.signature.methodName).toBe("c");
  });
});
