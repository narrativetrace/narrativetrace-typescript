// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import { describe, expect, test } from "vitest";
import { AsyncNarrativeContext } from "../src/async-context.js";

// Cross-port check for a cross-runtime finding: value rendering must never re-enter tracing.
// This is the concurrency dimension render-reentrancy.test.ts (packages/proxy) and
// packages/nestjs/__tests__/render-reentrancy.test.ts do not cover: does suppressing a
// render-triggered phantom span on ONE logical call leak into, or get confused with, a genuinely
// open span on a DIFFERENT, concurrently in-flight async call?
//
// The guard itself needs no AsyncLocalStorage/per-thread storage the way Java's ThreadLocal does:
// every renderValue()/renderCapture() call is fully synchronous end to end (no `await` anywhere in
// the render call graph — see rendering-guard.ts), and Node's run-to-completion semantics mean no
// other JS ever executes while one is mid-call. So the guard's "active" window can never overlap an
// unrelated concurrent call's code by construction — this test pins that guarantee rather than
// working around its absence. Barrier-based (a manually-resolved deferred promise), never a timer
// (release retrospective rule 3: wall-clock/scheduler are never test inputs).
describe("render reentrancy — concurrent async contexts", () => {
  test("rendering on one context does not suppress a genuinely open span on a concurrent context", async () => {
    let releasePause: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      releasePause = resolve;
    });

    const ctxA = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class ServiceA {
      async pause(): Promise<string> {
        await barrier;
        return "resumed";
      }
    }
    const tracedA = traceObject(new ServiceA(), ctxA);

    // Kick off A's call on the context's top-level (default) scope — it suspends at the barrier
    // with its span still open (not yet exited). Deliberately not wrapped in `ctxA.run()`: that
    // opens a fresh child scope whose spans only hand over to a PARENT scope, and there is no
    // parent here — the top-level default scope this call runs on directly is what `captureTrace()`
    // below reads from.
    const pendingA = tracedA.pause();

    // While A is suspended, B performs an unrelated, fully synchronous render-reentrant call on an
    // entirely separate context — its parameter's narrativeSummary() is itself a traced method.
    const ctxB = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class Line {
      narrativeSummary(): string {
        return "line-summary";
      }
    }
    const tracedLine = traceObject(new Line(), ctxB);
    class ServiceB {
      receive(_line: Line): string {
        return "received";
      }
    }
    expect(traceObject(new ServiceB(), ctxB).receive(tracedLine)).toBe("received");

    releasePause();
    await expect(pendingA).resolves.toBe("resumed");

    const treeA = ctxA.captureTrace();
    expect(treeA.roots).toHaveLength(1);
    expect(treeA.roots[0]?.signature.methodName).toBe("pause");
    expect(treeA.roots[0]?.children).toHaveLength(0);

    const treeB = ctxB.captureTrace();
    expect(treeB.roots).toHaveLength(1);
    expect(treeB.roots[0]?.signature.methodName).toBe("receive");
    expect(treeB.roots[0]?.children).toHaveLength(0);
  });
});
