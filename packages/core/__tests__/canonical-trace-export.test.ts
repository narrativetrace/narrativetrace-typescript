// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { CanonicalEntry } from "../src/canonical-entry.js";
import { canonicalEntries, exportCanonicalJson } from "../src/canonical-trace-export.js";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";
import { spanContext } from "../src/span-context.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import { humanName } from "../src/trace-namer.js";
import { traceNode } from "../src/trace-node.js";
import { incomplete, returned, threw } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

const trId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

function leaf(method: string, spanId?: SpanId) {
  return traceNode(
    methodSignature("Svc", method, []),
    returned('"ok"'),
    [],
    5,
    1_700_000_000_000,
    undefined,
    spanId ? spanContext(trId, spanId, null) : undefined,
  );
}

function eventTypes(entries: readonly CanonicalEntry[]): string[] {
  return entries.map((entry) => `${entry["nt.eventType"]}:${entry["code.function"]}`);
}

describe("canonicalEntries", () => {
  test("emits one enter and one exit per node, depth-first", () => {
    const child = leaf("inner");
    const root = traceNode(methodSignature("Svc", "outer", []), returned('"ok"'), [child], 9, 0);

    expect(eventTypes(canonicalEntries(traceTree([root])))).toStrictEqual([
      "method_enter:outer",
      "method_enter:inner",
      "method_exit:inner",
      "method_exit:outer",
    ]);
  });

  test("links a child to its parent by span id", () => {
    const child = leaf("inner");
    const root = traceNode(methodSignature("Svc", "outer", []), returned('"ok"'), [child], 9, 0);

    const [rootEnter, childEnter] = canonicalEntries(traceTree([root]));

    expect(rootEnter?.parent_span_id).toBeNull();
    expect(childEnter?.parent_span_id).toBe(rootEnter?.span_id);
  });

  test("an exit carries the node's own class and method, unlike an exit event", () => {
    const entries = canonicalEntries(traceTree([leaf("compute", sid(1))]));

    expect(entries[1]?.["code.namespace"]).toBe("Svc");
    expect(entries[1]?.["code.function"]).toBe("compute");
  });

  test("an empty tree exports an empty array", () => {
    expect(canonicalEntries(traceTree([]))).toStrictEqual([]);
    expect(exportCanonicalJson(traceTree([]))).toBe("[]");
  });
});

describe("identity of a tree with no span context", () => {
  test("stamps a real, W3C-shaped trace id, never a synthetic constant", () => {
    const entries = canonicalEntries(traceTree([leaf("compute")]));

    expect(entries[0]?.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(entries[0]?.trace_id).not.toBe("0".repeat(32));
  });

  test("every entry of one tree carries that one id, and the name agrees with it", () => {
    const entries = canonicalEntries(
      traceTree([
        traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [leaf("inner")], 3, 42),
      ]),
    );

    expect(new Set(entries.map((e) => e.trace_id)).size).toBe(1);
    for (const entry of entries) {
      expect(entry["nt.traceName"]).toBe(humanName(entry.trace_id as TraceId));
    }
  });

  test("two independent captures never share a trace id", () => {
    // Byte-stability of a unique field is the conformance normalizer's job — it folds `trace_id`
    // to a sequence before comparing goldens. An emitter that made two unrelated captures
    // identical was destroying the one thing `trace_id` exists to say.
    const build = () =>
      traceTree([
        traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [leaf("inner")], 3, 42),
      ]);

    expect(canonicalEntries(build())[0]?.trace_id).not.toBe(canonicalEntries(build())[0]?.trace_id);
  });

  test("synthetic span ids are 16 lowercase hex digits, as the schema requires", () => {
    const entries = canonicalEntries(traceTree([leaf("compute")]));

    expect(entries[0]?.span_id).toMatch(/^[0-9a-f]{16}$/);
  });

  test("derives the story from the first root call", () => {
    const entries = canonicalEntries(traceTree([leaf("compute")]));

    expect(entries[0]?.["nt.storyId"]).toBe("Svc.compute");
    expect(entries[0]?.["nt.chapterId"]).toBe("Svc.compute");
  });
});

describe("identity is inherited, never regenerated", () => {
  test("a context-free child adopts the trace id of the tree it belongs to", () => {
    const child = leaf("inner");
    const root = traceNode(
      methodSignature("Svc", "outer", []),
      returned('"ok"'),
      [child],
      9,
      0,
      undefined,
      spanContext(trId, sid(1), null),
    );

    const traceIds = new Set(canonicalEntries(traceTree([root])).map((e) => e.trace_id));

    expect([...traceIds]).toStrictEqual([trId]);
  });

  test("a real context found only deep in the tree still supplies the identity", () => {
    const child = leaf("inner", sid(7));
    const root = traceNode(methodSignature("Svc", "outer", []), returned('"ok"'), [child], 9, 0);

    expect(canonicalEntries(traceTree([root]))[0]?.trace_id).toBe(trId);
  });

  test("a nested context deeper than the second level still supplies the identity", () => {
    const grandchild = leaf("deepest", sid(9));
    const child = traceNode(
      methodSignature("Svc", "mid", []),
      returned('"ok"'),
      [grandchild],
      4,
      0,
    );
    const root = traceNode(methodSignature("Svc", "outer", []), returned('"ok"'), [child], 9, 0);

    expect(canonicalEntries(traceTree([root]))[0]?.trace_id).toBe(trId);
  });

  test("a tree adopts the id its capturing context assigned, over generating one", () => {
    const assigned = "ffffeeeeddddccccbbbbaaaa99998888" as TraceId;

    const entries = canonicalEntries(traceTree([leaf("compute")], assigned));

    expect(entries[0]?.trace_id).toBe(assigned);
    expect(entries[0]?.["nt.traceName"]).toBe(humanName(assigned));
  });

  test("the same tree read twice names one trace, not two", () => {
    // Resolution lives in the tree, not in any exporter: two exporters reading one capture must
    // be unable to disagree about which trace it is.
    const tree = traceTree([leaf("compute")]);

    expect(canonicalEntries(tree)[0]?.trace_id).toBe(canonicalEntries(tree)[0]?.trace_id);
  });

  test("service falls back when nothing in the tree pins one", () => {
    expect(canonicalEntries(traceTree([leaf("compute")]))[0]?.service).toBe("unknown_service:node");
  });

  test("service and environment come from the tree's context", () => {
    const root = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"'),
      [],
      1,
      0,
      undefined,
      spanContext(trId, sid(1), null, { serviceName: "orders", environment: "production" }),
    );

    const entry = canonicalEntries(traceTree([root]))[0];

    expect(entry?.service).toBe("orders");
    expect(entry?.environment).toBe("production");
  });
});

describe("outcomes use the entry vocabulary", () => {
  test("a returned call is a success carrying its value", () => {
    const exit = canonicalEntries(traceTree([leaf("compute", sid(1))]))[1];

    expect(exit?.["nt.outcome"]).toBe("success");
    expect(exit?.["nt.returnValue"]).toBe('"ok"');
  });

  test("a void completion is a success with no return value at all", () => {
    const node = traceNode(methodSignature("Svc", "notify", []), returned(null), [], 1, 0);

    const exit = canonicalEntries(traceTree([node]))[1];

    expect(exit?.["nt.outcome"]).toBe("success");
    expect("nt.returnValue" in (exit as object)).toBe(false);
    expect(exit?.message).toBe("← returned");
  });

  test("a thrown call is a failure carrying the exception", () => {
    const node = traceNode(
      methodSignature("Svc", "fail", []),
      threw(new TypeError("boom")),
      [],
      1,
      0,
    );

    const exit = canonicalEntries(traceTree([node]))[1];

    expect(exit?.["nt.outcome"]).toBe("failure");
    expect(exit?.level).toBe("error");
    expect(exit?.["exception.type"]).toBe("TypeError");
    expect(exit?.["exception.message"]).toBe("boom");
  });

  test("an unfinished call is incomplete", () => {
    const node = traceNode(methodSignature("Svc", "hang", []), incomplete(), [], 0, 0);

    expect(canonicalEntries(traceTree([node]))[1]?.["nt.outcome"]).toBe("incomplete");
  });

  test("a non-Error thrown value still names a type", () => {
    const node = traceNode(methodSignature("Svc", "fail", []), threw("plain string"), [], 1, 0);

    const exit = canonicalEntries(traceTree([node]))[1];

    expect(exit?.["exception.type"]).toBe("string");
    expect(exit?.["exception.message"]).toBe("plain string");
  });
});

describe("entry payload", () => {
  test("an enter carries the captured parameters", () => {
    const node = traceNode(
      methodSignature("Svc", "op", [parameterCapture("id", '"42"', false)]),
      returned('"ok"'),
      [],
      1,
      0,
    );

    expect(canonicalEntries(traceTree([node]))[0]?.["nt.parameters"]).toStrictEqual([
      { name: "id", value: '"42"' },
    ]);
  });

  test("an enter with no parameters omits the key entirely", () => {
    expect("nt.parameters" in (canonicalEntries(traceTree([leaf("op")]))[0] as object)).toBe(false);
  });

  test("a redacted parameter exports its marker, never the captured value", () => {
    const node = traceNode(
      methodSignature("Auth", "login", [parameterCapture("token", "[REDACTED]", true)]),
      returned('"ok"'),
      [],
      1,
      0,
    );

    expect(exportCanonicalJson(traceTree([node]))).toContain("[REDACTED]");
  });

  test("an exit carries the call's duration", () => {
    expect(canonicalEntries(traceTree([leaf("compute")]))[1]?.durationMs).toBe(5);
  });

  test("every entry stamps the schema version and entry type", () => {
    for (const entry of canonicalEntries(traceTree([leaf("compute")]))) {
      expect(entry["nt.schemaVersion"]).toBe("1.2");
      expect(entry["nt.entryType"]).toBe("entry");
    }
  });

  test("timestamps are ISO instants derived from the node's own clock", () => {
    const entries = canonicalEntries(traceTree([leaf("compute")]));

    expect(entries[0]?.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    expect(entries[1]?.timestamp).toBe(new Date(1_700_000_000_005).toISOString());
  });
});

describe("exportCanonicalJson", () => {
  test("is a flat JSON array of entries", () => {
    const parsed = JSON.parse(exportCanonicalJson(traceTree([leaf("compute")])));

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  test("is pretty-printed at two spaces, like every other artifact", () => {
    expect(exportCanonicalJson(traceTree([leaf("compute")]))).toContain('\n  {\n    "trace_id"');
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

  test("canonicalEntries does not crash on a cyclic tree", () => {
    expect(() => canonicalEntries(traceTree([cyclicRoot()]))).not.toThrow();
  });

  test("canonicalEntries does not stack-overflow on a very deep chain", () => {
    expect(() => canonicalEntries(traceTree([deepChain(50_000)]))).not.toThrow();
  });
});
