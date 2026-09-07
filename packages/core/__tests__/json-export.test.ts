// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "../src/branded-types.js";
import { concurrencyInfo } from "../src/concurrency-info.js";
import { exportChapter, exportJson } from "../src/json-export.js";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import { traceNode } from "../src/trace-node.js";
import { incomplete, returned, threw } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

const trId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function sc(spanId: SpanId, parentSpanId: SpanId | null = null) {
  return spanContext(trId, spanId, parentSpanId);
}

describe("exportJson", () => {
  test("a redacted param exports the [REDACTED] marker, not the captured value", () => {
    const node = traceNode(
      methodSignature("Auth", "login", [parameterCapture("token", "SECRET", true)]),
      returned('"OK"'),
      [],
    );
    const json = exportJson(traceTree([node]), { scenario: "Login" });
    expect(json).toContain("[REDACTED]");
    expect(json).not.toContain("SECRET");
  });

  test("single method produces enter and exit events", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("orderId", '"order-42"', false),
      ]),
      returned('"OK"'),
      [],
      15,
      100,
      undefined,
      sc(sid(1)),
    );
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Places order" });
    const result = JSON.parse(json);

    expect(result.version).toBe("1.0");
    expect(result.scenario.name).toBe("Places order");
    expect(result.scenario.result).toBe("success");
    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe("enter");
    expect(result.events[0].className).toBe("OrderService");
    expect(result.events[0].methodName).toBe("placeOrder");
    expect(result.trace.traceId).toBe(trId);
    expect(result.events[0].traceId).toBeUndefined();
    expect(result.events[0].spanId).toBe(sid(1));
    expect(result.events[0].parameters).toStrictEqual([{ name: "orderId", value: '"order-42"' }]);
    expect(result.events[1].type).toBe("exit");
    expect(result.events[1].outcome).toBe("returned");
    expect(result.events[1].returnValue).toBe('"OK"');
    expect(result.events[1].durationMs).toBe(15);
  });

  test("nested calls have correct parent-child spanIds", () => {
    const child = traceNode(
      methodSignature("InventoryService", "reserve", []),
      returned("true"),
      [],
      undefined,
      undefined,
      undefined,
      sc(sid(2), sid(1)),
    );
    const root = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      returned('"OK"'),
      [child],
      undefined,
      undefined,
      undefined,
      sc(sid(1)),
    );
    const tree = traceTree([root]);

    const json = exportJson(tree, { scenario: "Nested" });
    const result = JSON.parse(json);

    expect(result.events).toHaveLength(4);
    const rootEnter = result.events[0];
    const childEnter = result.events[1];

    expect(rootEnter.spanId).toBe(sid(1));
    expect(rootEnter.parentSpanId).toBeUndefined();
    expect(childEnter.spanId).toBe(sid(2));
    expect(childEnter.parentSpanId).toBe(sid(1));
  });

  test("exception events include error type and message", () => {
    const node = traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "100", false)]),
      threw(new TypeError("invalid amount")),
      [],
    );
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Payment fails" });
    const result = JSON.parse(json);

    expect(result.scenario.result).toBe("error");
    const exitEvent = result.events[1];
    expect(exitEvent.outcome).toBe("threw");
    expect(exitEvent.errorType).toBe("TypeError");
    expect(exitEvent.errorMessage).toBe("invalid amount");
  });

  test("metadata fields appear in scenario section", () => {
    const node = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), []);
    const tree = traceTree([node]);

    const json = exportJson(tree, {
      scenario: "Places order",
      testClass: "OrderTest",
      testMethod: "testPlaceOrder",
      framework: "vitest",
      timestamp: "2026-02-27T12:00:00Z",
    });
    const result = JSON.parse(json);

    expect(result.scenario.testClass).toBe("OrderTest");
    expect(result.scenario.testMethod).toBe("testPlaceOrder");
    expect(result.scenario.framework).toBe("vitest");
    expect(result.scenario.timestamp).toBe("2026-02-27T12:00:00Z");
  });

  test("non-Error exception exports as string message without type", () => {
    const node = traceNode(methodSignature("Svc", "op", []), threw("raw string error"), []);
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Non-Error" });
    const result = JSON.parse(json);

    const exitEvent = result.events[1];
    expect(exitEvent.outcome).toBe("threw");
    expect(exitEvent.errorMessage).toBe("raw string error");
    expect(exitEvent.errorType).toBeUndefined();
  });

  test("incomplete outcome exports as outcome field only", () => {
    const node = traceNode(methodSignature("Svc", "op", []), incomplete(), []);
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Incomplete" });
    const result = JSON.parse(json);

    const exitEvent = result.events[1];
    expect(exitEvent.outcome).toBe("incomplete");
    expect(exitEvent.returnValue).toBeUndefined();
    expect(exitEvent.errorMessage).toBeUndefined();
  });

  test("redacted parameters are marked in output", () => {
    const node = traceNode(
      methodSignature("AuthService", "login", [
        parameterCapture("username", '"alice"', false),
        parameterCapture("password", "***", true),
      ]),
      returned('"token-123"'),
      [],
    );
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Login" });
    const result = JSON.parse(json);

    expect(result.events[0].parameters).toStrictEqual([
      { name: "username", value: '"alice"' },
      { name: "password", value: "[REDACTED]", redacted: true },
    ]);
  });

  test("sequential node has no concurrency field in JSON", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    const exitEvent = result.events.find((e: { type: string }) => e.type === "exit");
    expect(exitEvent.concurrency).toBeUndefined();
  });

  test("concurrent node includes concurrency object with all fields", () => {
    const info = concurrencyInfo("fork-1", "Svc.op", "fork-join");
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 10, 100, info);
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    const exitEvent = result.events.find((e: { type: string }) => e.type === "exit");
    expect(exitEvent.concurrency).toStrictEqual({
      groupId: "fork-1",
      kind: "fork-join",
      taskLabel: "Svc.op",
    });
  });

  test("fire-and-forget node includes concurrency with correct kind", () => {
    const info = concurrencyInfo("fanf-1", "OrderService", "fire-and-forget");
    const node = traceNode(
      methodSignature("OrderService", "⤳ fire-and-forget", []),
      returned(null),
      [],
      0,
      0,
      info,
    );
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    const exitEvent = result.events.find((e: { type: string }) => e.type === "exit");
    expect(exitEvent.concurrency.kind).toBe("fire-and-forget");
    expect(exitEvent.concurrency.groupId).toBe("fanf-1");
  });

  test("concurrency taskLabel included when present", () => {
    const info = concurrencyInfo("fork-1", "DiscountService.calculateDiscount", "fork-join");
    const node = traceNode(
      methodSignature("DiscountService", "calculateDiscount", []),
      returned('"ok"'),
      [],
      10,
      100,
      info,
    );
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    const exitEvent = result.events.find((e: { type: string }) => e.type === "exit");
    expect(exitEvent.concurrency.taskLabel).toBe("DiscountService.calculateDiscount");
  });

  test("concurrency groupId matches across forked siblings", () => {
    const info1 = concurrencyInfo("fork-1", "A.a", "fork-join");
    const info2 = concurrencyInfo("fork-1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 10, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 10, 100, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    const exits = result.events.filter(
      (e: { type: string; concurrency?: unknown }) => e.type === "exit" && e.concurrency,
    );
    expect(exits).toHaveLength(2);
    expect(exits[0].concurrency.groupId).toBe(exits[1].concurrency.groupId);
  });

  test("nodes without spanContext use synthetic IDs", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    // A span-less capture still resolves an identity (owner decision 2026-08-31, TODO 26c) — the
    // block is never omitted, only its request-scoped fields are.
    expect(result.trace.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(result.trace.serviceName).toBeUndefined();
    expect(result.events[0].traceId).toBeUndefined();
    expect(result.events[0].spanId).toBe("1");
  });

  test("correlation fields omitted from scenario when not in metadata", () => {
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), []);
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    expect(result.scenario).not.toHaveProperty("traceId");
    expect(result.scenario).not.toHaveProperty("spanId");
    expect(result.scenario).not.toHaveProperty("requestId");
  });

  test("trace block contains root SpanContext trace-level fields", () => {
    const root = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      returned('"OK"'),
      [],
      15,
      100,
      undefined,
      spanContext(trId, sid(1), null, {
        serviceName: "order-service",
        serviceVersion: "1.0.0",
        environment: "production",
      }),
    );
    const tree = traceTree([root]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    expect(result.trace.traceId).toBe(trId);
    expect(result.trace.serviceName).toBe("order-service");
    expect(result.trace.serviceVersion).toBe("1.0.0");
    expect(result.trace.environment).toBe("production");
  });

  test("trace block includes HTTP and user context fields", () => {
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"'),
      [],
      10,
      100,
      undefined,
      spanContext(
        trId,
        sid(1),
        null,
        { serviceName: "svc" },
        {
          httpMethod: "POST",
          httpRoute: "/api/orders" as HttpRoute,
          clientIp: "10.0.0.1" as ClientIp,
          enduserId: "user-42" as EnduserId,
          sessionId: "sess-1" as SessionId,
          tenantId: "tenant-a" as TenantId,
        },
      ),
    );
    const tree = traceTree([root]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    expect(result.trace.httpMethod).toBe("POST");
    expect(result.trace.httpRoute).toBe("/api/orders");
    expect(result.trace.clientIp).toBe("10.0.0.1");
    expect(result.trace.enduserId).toBe("user-42");
    expect(result.trace.sessionId).toBe("sess-1");
    expect(result.trace.tenantId).toBe("tenant-a");
  });

  test("trace block omits undefined optional fields", () => {
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"'),
      [],
      10,
      100,
      undefined,
      sc(sid(1)),
    );
    const tree = traceTree([root]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    expect(result.trace.serviceName).toBeUndefined();
    expect(result.trace.httpMethod).toBeUndefined();
    expect(result.trace.clientIp).toBeUndefined();
    expect(result.trace.enduserId).toBeUndefined();
  });

  test("traceId not present on per-event entries", () => {
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"OK"'),
      [],
      undefined,
      undefined,
      undefined,
      sc(sid(1)),
    );
    const tree = traceTree([root]);

    const json = exportJson(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    for (const event of result.events) {
      expect(event.traceId).toBeUndefined();
    }
  });

  test("JSON round-trip preserves concurrency fields", () => {
    const info = concurrencyInfo("fork-1", "Svc.op", "fork-join");
    const node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 10, 100, info);
    const tree = traceTree([node]);

    const json = exportJson(tree, { scenario: "Test" });
    const parsed = JSON.parse(json);
    const roundTripped = JSON.parse(JSON.stringify(parsed));

    const exit = roundTripped.events.find((e: { type: string }) => e.type === "exit");
    expect(exit.concurrency).toStrictEqual({
      groupId: "fork-1",
      kind: "fork-join",
      taskLabel: "Svc.op",
    });
  });
});

describe("exportChapter", () => {
  test("produces flat chapter entry with required fields", () => {
    const root = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      returned('"OK"'),
      [],
      15,
      100,
      undefined,
      spanContext(
        trId,
        sid(1),
        null,
        { serviceName: "order-service" },
        {
          storyId: "OrderService.placeOrder",
          chapterId: "OrderService.placeOrder",
        },
      ),
    );
    const tree = traceTree([root]);

    const json = exportChapter(tree, { scenario: "Places order" });
    const result = JSON.parse(json);

    expect(result["nt.entryType"]).toBe("chapter");
    expect(result["nt.schemaVersion"]).toBe("1.2");
    expect(result["nt.storyId"]).toBe("OrderService.placeOrder");
    expect(result["nt.chapterId"]).toBe("OrderService.placeOrder");
    expect(result["nt.title"]).toBe("OrderService.placeOrder");
    expect(result["nt.outcome"]).toBe("success");
    expect(result["nt.totalDurationMs"]).toBe(15);
    expect(result["nt.entryCount"]).toBe(1);
    expect(result["nt.completionStatus"]).toBe("complete");
    expect(result.trace_id).toBe(trId);
    expect(result.service).toBe("order-service");
    expect(result.level).toBe("info");
    expect(result.message).toContain("OrderService.placeOrder");
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result["nt.traceName"]).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });

  test("includes nt.chapterTree with embedded tree JSON", () => {
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"OK"'),
      [],
      10,
      100,
      undefined,
      sc(sid(1)),
    );
    const tree = traceTree([root]);

    const json = exportChapter(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    const embedded = JSON.parse(result["nt.chapterTree"]);
    expect(embedded.version).toBe("1.0");
    expect(embedded.events).toHaveLength(2);
  });

  test("error outcome reflected in chapter", () => {
    const root = traceNode(
      methodSignature("Svc", "fail", []),
      threw(new Error("boom")),
      [],
      5,
      100,
      undefined,
      sc(sid(1)),
    );
    const tree = traceTree([root]);

    const json = exportChapter(tree, { scenario: "Failure" });
    const result = JSON.parse(json);

    // `chapter.schema.json` enumerates success/failure/partial — `error` was never legal here,
    // though it is the right word for `scenario.result` inside the tree envelope.
    expect(result["nt.outcome"]).toBe("failure");
    expect(result.level).toBe("error");
    expect(result.message).toContain("failure");
  });

  test("an unfinished chapter is partial, not a success and not a failure", () => {
    const root = traceNode(
      methodSignature("Svc", "hang", []),
      incomplete(),
      [],
      5,
      100,
      undefined,
      sc(sid(1)),
    );

    const result = JSON.parse(exportChapter(traceTree([root]), { scenario: "Never finished" }));

    expect(result["nt.outcome"]).toBe("partial");
  });

  test("a failure deep in the tree still fails the chapter", () => {
    const child = traceNode(
      methodSignature("Repo", "find", []),
      threw(new Error("boom")),
      [],
      1,
      100,
      undefined,
      sc(sid(2)),
    );
    const root = traceNode(
      methodSignature("Svc", "handled", []),
      returned('"recovered"'),
      [child],
      5,
      100,
      undefined,
      sc(sid(1)),
    );

    const result = JSON.parse(exportChapter(traceTree([root]), { scenario: "Recovered" }));

    // A pinned divergence from Java, which reads the first root only: a chapter containing a
    // thrown call is not a clean success here, and `level` has always agreed.
    expect(result["nt.outcome"]).toBe("failure");
    expect(result.level).toBe("error");
  });

  test("counts all nodes including nested children", () => {
    const child = traceNode(
      methodSignature("Repo", "find", []),
      returned('"found"'),
      [],
      5,
      100,
      undefined,
      sc(sid(2), sid(1)),
    );
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"'),
      [child],
      15,
      100,
      undefined,
      sc(sid(1)),
    );
    const tree = traceTree([root]);

    const json = exportChapter(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    expect(result["nt.entryCount"]).toBe(2);
  });

  test("chapter without spanContext uses class.method as title", () => {
    const root = traceNode(
      methodSignature("FallbackService", "doWork", []),
      returned('"ok"'),
      [],
      10,
      100,
    );
    const tree = traceTree([root]);

    const json = exportChapter(tree, { scenario: "Fallback" });
    const result = JSON.parse(json);

    expect(result["nt.title"]).toBe("FallbackService.doWork");
    // trace_id and nt.traceName are patterned by chapter.schema.json, so the empty strings this
    // path used to write produced a chapter that failed its own schema. Identity is generated
    // eagerly instead: real, unique, and agreeing with its own human name.
    expect(result.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(result["nt.traceName"]).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
    expect(result.environment).toBeUndefined();
    // service, nt.storyId and nt.chapterId are all required by chapter.schema.json. Story and
    // chapter are DERIVED from the first root-level call, never from the title — the title is a
    // separate field and must not stand in for identity.
    expect(result.service).toBe("unknown_service:node");
    expect(result["nt.storyId"]).toBe("FallbackService.doWork");
    expect(result["nt.chapterId"]).toBe("FallbackService.doWork");
  });

  test("chapter includes environment when present", () => {
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"'),
      [],
      10,
      100,
      undefined,
      spanContext(
        trId,
        sid(1),
        null,
        {
          serviceName: "svc",
          environment: "staging",
        },
        {
          storyId: "Svc.op",
          chapterId: "Svc.op",
        },
      ),
    );
    const tree = traceTree([root]);

    const json = exportChapter(tree, { scenario: "Test" });
    const result = JSON.parse(json);

    expect(result.service).toBe("svc");
    expect(result.environment).toBe("staging");
    expect(result["nt.storyId"]).toBe("Svc.op");
    expect(result["nt.chapterId"]).toBe("Svc.op");
  });
});

describe("chapter identity resolves for the whole tree", () => {
  function chapterOf(tree: ReturnType<typeof traceTree>): Record<string, string> {
    return JSON.parse(exportChapter(tree, { scenario: "Test" }));
  }

  test("adopts the id the capturing context assigned to the tree", () => {
    const assignedId = "ffffeeeeddddccccbbbbaaaa99998888" as TraceId;
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 1, 0);

    expect(chapterOf(traceTree([root], assignedId)).trace_id).toBe(assignedId);
  });

  test("a context found only deep in the tree supplies id, service and environment", () => {
    // The mixed-tree rule: `roots[0]` carries nothing, and reading only it reported an
    // unidentified chapter for a capture that was fully identified one level down.
    const child = traceNode(
      methodSignature("Repo", "find", []),
      returned('"row"'),
      [],
      2,
      100,
      undefined,
      spanContext(trId, sid(2), null, { serviceName: "orders", environment: "production" }),
    );
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child], 10, 100);

    const result = chapterOf(traceTree([root]));

    expect(result.trace_id).toBe(trId);
    expect(result.service).toBe("orders");
    expect(result.environment).toBe("production");
  });

  test("two independent context-free captures never report the same trace", () => {
    const build = () =>
      traceTree([traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 1, 0)]);

    expect(chapterOf(build()).trace_id).not.toBe(chapterOf(build()).trace_id);
  });

  test("a chapter for a tree that captured nothing still carries a real identity", () => {
    const result = chapterOf(traceTree([]));

    expect(result.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(result["nt.traceName"]).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
    // No root call to derive from: story and chapter take the same fallback the title does.
    expect(result["nt.storyId"]).toBe(result["nt.title"]);
    expect(result["nt.chapterId"]).toBe(result["nt.title"]);
  });
});

describe("the chapter and its embedded tree name the same trace (TODO 26c, third emitter)", () => {
  function embeddedTreeOf(json: string) {
    return JSON.parse(JSON.parse(json)["nt.chapterTree"]);
  }

  test("a plain span-carrying capture agrees end to end", () => {
    const root = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      returned('"OK"'),
      [],
      15,
      100,
      undefined,
      sc(sid(1)),
    );
    const json = exportChapter(traceTree([root]), { scenario: "Test" });
    const chapter = JSON.parse(json);
    const embedded = embeddedTreeOf(json);

    expect(embedded.trace.traceId).toBe(chapter.trace_id);
    expect(embedded.trace.traceName).toBe(chapter["nt.traceName"]);
  });

  test("a tree that kept no span context still agrees — the gap this item closed", () => {
    // Before the fix, buildTraceBlock scanned roots[0]?.spanContext directly and omitted the
    // whole block for a span-less tree, so the embedded document named no trace while the
    // chapter around it did.
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [], 10, 100);
    const json = exportChapter(traceTree([root]), { scenario: "Test" });
    const chapter = JSON.parse(json);
    const embedded = embeddedTreeOf(json);

    expect(embedded.trace.traceId).toBe(chapter.trace_id);
    expect(embedded.trace.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  test("a context found only on a child is inherited depth-first, not roots-only", () => {
    // The other half of the divergence: buildTraceBlock read roots[0] only, so a mixed tree
    // whose context sat on a descendant resolved to "no trace" here while the chapter (which
    // already scanned depth-first) inherited it.
    const child = traceNode(
      methodSignature("Repo", "find", []),
      returned('"row"'),
      [],
      2,
      100,
      undefined,
      spanContext(trId, sid(2), null, { serviceName: "orders" }),
    );
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child], 10, 100);
    const json = exportChapter(traceTree([root]), { scenario: "Test" });
    const chapter = JSON.parse(json);
    const embedded = embeddedTreeOf(json);

    expect(embedded.trace.traceId).toBe(chapter.trace_id);
    expect(embedded.trace.traceId).toBe(trId);
    expect(embedded.trace.serviceName).toBe("orders");
  });

  test("a tree that captured nothing still agrees — identity resolved once, not per emitter", () => {
    // A genuinely empty tree carries no traceId of its own (traceTree([]) assigns none), so an
    // identity resolved independently by each emitter would generate two different ids here.
    // exportChapter resolves once and threads it into the embedded document instead.
    const json = exportChapter(traceTree([]), { scenario: "Test" });
    const chapter = JSON.parse(json);
    const embedded = embeddedTreeOf(json);

    expect(embedded.trace.traceId).toBe(chapter.trace_id);
    expect(embedded.trace.traceName).toBe(chapter["nt.traceName"]);
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-port mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot() {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned('"ok"'),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as ReturnType<typeof traceNode>;
  }

  function deepChain(length: number) {
    let node = traceNode(methodSignature("Leaf", "op", []), returned('"ok"'), []);
    for (let i = 0; i < length; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [node]);
    }
    return node;
  }

  test("exportJson does not crash on a cyclic tree and marks the cycle point truncated", () => {
    const json = exportJson(traceTree([cyclicRoot()]), { scenario: "Test" });
    const parsed = JSON.parse(json);
    const truncated = parsed.events.filter((e: { truncated?: string }) => e.truncated === "cycle");
    expect(truncated.length).toBeGreaterThan(0);
  });

  test("exportJson does not stack-overflow on a very deep chain", () => {
    const json = exportJson(traceTree([deepChain(50_000)]), { scenario: "Test" });
    const parsed = JSON.parse(json);
    const truncated = parsed.events.filter(
      (e: { truncated?: string }) => e.truncated === "depth-limit",
    );
    expect(truncated.length).toBe(1);
  });

  test("exportChapter does not crash on a cyclic tree", () => {
    expect(() => exportChapter(traceTree([cyclicRoot()]), { scenario: "Test" })).not.toThrow();
  });
});
