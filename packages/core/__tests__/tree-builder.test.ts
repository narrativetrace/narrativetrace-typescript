// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import type { TraceEvent } from "../src/trace-event.js";
import { returned, threw } from "../src/trace-outcome.js";
import { buildTraceTree } from "../src/tree-builder.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function sc(spanId: SpanId, parentSpanId: SpanId | null = null) {
  return spanContext(traceId, spanId, parentSpanId);
}

function sig(className: string, methodName: string) {
  return methodSignature(className, methodName, []);
}

describe("buildTraceTree", () => {
  test("single enter+exit pair builds one root node", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "foo") },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 110, outcome: returned('"result"') },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.className).toBe("A");
    expect(tree.roots[0].signature.methodName).toBe("foo");
    expect(tree.roots[0].outcome).toEqual({ kind: "returned", renderedValue: '"result"' });
    expect(tree.roots[0].durationMs).toBe(10);
    expect(tree.roots[0].startTimeMs).toBe(100);
    expect(tree.roots[0].children).toHaveLength(0);
  });

  // Browsers coarsen performance.now() as a Spectre mitigation -- Chrome clamps
  // to 100us -- so a call tree fast enough to finish inside one tick reports a
  // single timestamp for every span. Node's clock is fine-grained enough that
  // this never fires there, which is why it reached a browser undetected.
  describe("when every event shares one timestamp (a clamped browser clock)", () => {
    const TICK = 1000;

    test("a three-deep tree keeps every span", () => {
      const events: TraceEvent[] = [
        { type: "enter", spanContext: sc(sid(0)), timestamp: TICK, signature: sig("A", "top") },
        {
          type: "enter",
          spanContext: sc(sid(1), sid(0)),
          timestamp: TICK,
          signature: sig("B", "middle"),
        },
        {
          type: "enter",
          spanContext: sc(sid(2), sid(1)),
          timestamp: TICK,
          signature: sig("C", "leaf"),
        },
        {
          type: "exit",
          spanContext: sc(sid(2), sid(1)),
          timestamp: TICK,
          outcome: returned("3"),
        },
        {
          type: "exit",
          spanContext: sc(sid(1), sid(0)),
          timestamp: TICK,
          outcome: returned("2"),
        },
        { type: "exit", spanContext: sc(sid(0)), timestamp: TICK, outcome: returned("1") },
      ];

      const tree = buildTraceTree(events, "detail");

      expect(tree.roots).toHaveLength(1);
      expect(tree.roots[0].signature.methodName).toBe("top");
      expect(tree.roots[0].children).toHaveLength(1);
      expect(tree.roots[0].children[0].signature.methodName).toBe("middle");
      expect(tree.roots[0].children[0].children).toHaveLength(1);
      expect(tree.roots[0].children[0].children[0].signature.methodName).toBe("leaf");
    });

    test("two siblings both survive, in call order", () => {
      const events: TraceEvent[] = [
        { type: "enter", spanContext: sc(sid(0)), timestamp: TICK, signature: sig("A", "parent") },
        {
          type: "enter",
          spanContext: sc(sid(1), sid(0)),
          timestamp: TICK,
          signature: sig("B", "first"),
        },
        {
          type: "exit",
          spanContext: sc(sid(1), sid(0)),
          timestamp: TICK,
          outcome: returned("1"),
        },
        {
          type: "enter",
          spanContext: sc(sid(2), sid(0)),
          timestamp: TICK,
          signature: sig("B", "second"),
        },
        {
          type: "exit",
          spanContext: sc(sid(2), sid(0)),
          timestamp: TICK,
          outcome: returned("2"),
        },
        { type: "exit", spanContext: sc(sid(0)), timestamp: TICK, outcome: returned("0") },
      ];

      const tree = buildTraceTree(events, "detail");

      expect(tree.roots).toHaveLength(1);
      expect(tree.roots[0].children.map((c) => c.signature.methodName)).toEqual([
        "first",
        "second",
      ]);
    });
  });

  test("nested enter/exit pairs build parent-child tree", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "outer") },
      {
        type: "enter",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 105,
        signature: sig("B", "inner"),
      },
      {
        type: "exit",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 110,
        outcome: returned('"inner"'),
      },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 120, outcome: returned('"outer"') },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("outer");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("inner");
    expect(tree.roots[0].children[0].children).toHaveLength(0);
  });

  test("sibling enter/exit pairs build multiple roots", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "first") },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 110, outcome: returned(null) },
      { type: "enter", spanContext: sc(sid(1)), timestamp: 120, signature: sig("A", "second") },
      { type: "exit", spanContext: sc(sid(1)), timestamp: 130, outcome: returned(null) },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots).toHaveLength(2);
    expect(tree.roots[0].signature.methodName).toBe("first");
    expect(tree.roots[1].signature.methodName).toBe("second");
  });

  test("enter without matching exit produces incomplete node", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "stuck") },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("stuck");
    expect(tree.roots[0].outcome.kind).toBe("incomplete");
  });

  test("exit without matching enter is ignored", () => {
    const events: TraceEvent[] = [
      { type: "exit", spanContext: sc(sid(99)), timestamp: 200, outcome: returned(null) },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots).toHaveLength(0);
  });

  test("errors level discards successful root nodes", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "ok") },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 110, outcome: returned(null) },
      { type: "enter", spanContext: sc(sid(1)), timestamp: 120, signature: sig("A", "fail") },
      { type: "exit", spanContext: sc(sid(1)), timestamp: 130, outcome: threw(new Error("boom")) },
    ];

    const tree = buildTraceTree(events, "errors");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("fail");
  });

  test("errors level keeps incomplete root nodes", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "ok") },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 110, outcome: returned(null) },
      { type: "enter", spanContext: sc(sid(1)), timestamp: 120, signature: sig("A", "stuck") },
    ];

    const tree = buildTraceTree(events, "errors");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("stuck");
    expect(tree.roots[0].outcome.kind).toBe("incomplete");
  });

  test("errors level keeps successful child nodes under failed root", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "outer") },
      {
        type: "enter",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 105,
        signature: sig("B", "helper"),
      },
      { type: "exit", spanContext: sc(sid(1), sid(0)), timestamp: 108, outcome: returned('"ok"') },
      {
        type: "exit",
        spanContext: sc(sid(0)),
        timestamp: 120,
        outcome: threw(new Error("outer failed")),
      },
    ];

    const tree = buildTraceTree(events, "errors");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("outer");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("helper");
    expect(tree.roots[0].children[0].outcome.kind).toBe("returned");
  });

  test("errors level keeps a returned root that has a throwing descendant", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "root") },
      { type: "enter", spanContext: sc(sid(1), sid(0)), timestamp: 102, signature: sig("B", "ok") },
      { type: "exit", spanContext: sc(sid(1), sid(0)), timestamp: 104, outcome: returned('"ok"') },
      {
        type: "enter",
        spanContext: sc(sid(2), sid(0)),
        timestamp: 106,
        signature: sig("C", "bad"),
      },
      {
        type: "exit",
        spanContext: sc(sid(2), sid(0)),
        timestamp: 108,
        outcome: threw(new Error("boom")),
      },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 120, outcome: returned('"done"') },
    ];

    const tree = buildTraceTree(events, "errors");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("root");
    // the successful sibling is pruned; only the error path is retained
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("bad");
  });

  test("summary level collapses intermediate successful frames to root + leaves", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "root") },
      {
        type: "enter",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 102,
        signature: sig("B", "mid"),
      },
      {
        type: "enter",
        spanContext: sc(sid(2), sid(1)),
        timestamp: 104,
        signature: sig("C", "leaf"),
      },
      { type: "exit", spanContext: sc(sid(2), sid(1)), timestamp: 106, outcome: returned('"l"') },
      { type: "exit", spanContext: sc(sid(1), sid(0)), timestamp: 108, outcome: returned('"m"') },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 120, outcome: returned('"r"') },
    ];

    const narrative = buildTraceTree(events, "narrative");
    const summary = buildTraceTree(events, "summary");

    // narrative: root → mid → leaf (3 levels)
    expect(narrative.roots[0].children[0].signature.methodName).toBe("mid");
    // summary: root → leaf (mid collapsed)
    expect(summary.roots[0].children).toHaveLength(1);
    expect(summary.roots[0].children[0].signature.methodName).toBe("leaf");
  });

  test("summary level retains an intermediate error frame", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "root") },
      {
        type: "enter",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 102,
        signature: sig("B", "mid"),
      },
      {
        type: "enter",
        spanContext: sc(sid(2), sid(1)),
        timestamp: 104,
        signature: sig("C", "leaf"),
      },
      { type: "exit", spanContext: sc(sid(2), sid(1)), timestamp: 106, outcome: returned('"l"') },
      {
        type: "exit",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 108,
        outcome: threw(new Error("mid failed")),
      },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 120, outcome: returned('"r"') },
    ];

    const summary = buildTraceTree(events, "summary");

    expect(summary.roots[0].children).toHaveLength(1);
    expect(summary.roots[0].children[0].signature.methodName).toBe("mid");
    expect(summary.roots[0].children[0].outcome.kind).toBe("threw");
  });

  test("off level yields an empty tree over non-empty events", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "op") },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 110, outcome: returned('"x"') },
    ];

    expect(buildTraceTree(events, "off").roots).toHaveLength(0);
  });

  test("enter with missing parent falls back to root", () => {
    const events: TraceEvent[] = [
      {
        type: "enter",
        spanContext: sc(sid(5), sid(999)),
        timestamp: 100,
        signature: sig("Svc", "task"),
      },
      {
        type: "exit",
        spanContext: sc(sid(5), sid(999)),
        timestamp: 110,
        outcome: returned('"ok"'),
      },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.className).toBe("Svc");
  });

  test("deep nesting builds correct multi-level tree", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "top") },
      {
        type: "enter",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 105,
        signature: sig("B", "mid"),
      },
      {
        type: "enter",
        spanContext: sc(sid(2), sid(1)),
        timestamp: 108,
        signature: sig("C", "bot"),
      },
      { type: "exit", spanContext: sc(sid(2), sid(1)), timestamp: 109, outcome: returned(null) },
      { type: "exit", spanContext: sc(sid(1), sid(0)), timestamp: 112, outcome: returned(null) },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 120, outcome: returned(null) },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("top");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("mid");
    expect(tree.roots[0].children[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].children[0].signature.methodName).toBe("bot");
  });

  test("ForkCreatedEvent attaches concurrency info to matching node", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("Ctrl", "handle") },
      {
        type: "enter",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 105,
        signature: sig("Svc", "task"),
      },
      { type: "exit", spanContext: sc(sid(1), sid(0)), timestamp: 110, outcome: returned('"ok"') },
      {
        type: "fork-created",
        groupId: "fork-1",
        parentSpanId: sid(0),
        rootSpanId: sid(1),
        strategy: "fork-join",
        timestamp: 115,
      },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 120, outcome: returned('"done"') },
    ];

    const tree = buildTraceTree(events, "detail");

    const child = tree.roots[0].children[0];
    expect(child.concurrency).toBeDefined();
    expect(child.concurrency?.kind).toBe("fork-join");
    expect(child.concurrency?.groupId).toBe("fork-1");
    expect(child.concurrency?.taskLabel).toBe("Svc.task");
  });

  test("ForkCreatedEvent with fire-and-forget strategy", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("Ctrl", "handle") },
      {
        type: "enter",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 105,
        signature: sig("Notify", "send"),
      },
      {
        type: "exit",
        spanContext: sc(sid(1), sid(0)),
        timestamp: 110,
        outcome: returned('"sent"'),
      },
      {
        type: "fork-created",
        groupId: "fanf-1",
        parentSpanId: sid(0),
        rootSpanId: sid(1),
        strategy: "fire-and-forget",
        timestamp: 115,
      },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 120, outcome: returned('"done"') },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots[0].children[0].concurrency?.kind).toBe("fire-and-forget");
  });

  test("nodes without ForkCreatedEvent have no concurrency info", () => {
    const events: TraceEvent[] = [
      { type: "enter", spanContext: sc(sid(0)), timestamp: 100, signature: sig("A", "foo") },
      { type: "exit", spanContext: sc(sid(0)), timestamp: 110, outcome: returned(null) },
    ];

    const tree = buildTraceTree(events, "detail");

    expect(tree.roots[0].concurrency).toBeUndefined();
  });

  describe("when a chain runs far deeper than the JS call stack", () => {
    const DEPTH = 50_000;

    function deepChainEvents(depth: number, leafThrows: boolean): TraceEvent[] {
      const events: TraceEvent[] = [];
      for (let i = 0; i < depth; i++) {
        events.push({
          type: "enter",
          spanContext: sc(sid(i), i === 0 ? null : sid(i - 1)),
          timestamp: i,
          signature: sig("A", `call${i}`),
        });
      }
      for (let i = depth - 1; i >= 0; i--) {
        const outcome = leafThrows && i === depth - 1 ? threw(new Error("boom")) : returned(null);
        events.push({ type: "exit", spanContext: sc(sid(i)), timestamp: depth + i, outcome });
      }
      return events;
    }

    test("errors level prunes a chain deeper than the call stack without crashing", () => {
      const events = deepChainEvents(DEPTH, true);

      const tree = buildTraceTree(events, "errors");

      expect(tree.roots).toHaveLength(1);
    });

    test("summary level collapses a chain deeper than the call stack without crashing", () => {
      const events = deepChainEvents(DEPTH, false);

      const tree = buildTraceTree(events, "summary");

      expect(tree.roots).toHaveLength(1);
    });
  });
});
