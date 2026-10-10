// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { concurrencyInfo } from "../src/concurrency-info.js";
import { renderIndentedText } from "../src/indented-text-renderer.js";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";
import { humanName } from "../src/trace-namer.js";
import { traceNode } from "../src/trace-node.js";
import { incomplete, returned, threw } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

/**
 * The `trace: <phrase> (<7 hex>)` header every non-empty tree now opens with (2026-09-13 ruling,
 * item 4) — computed from the tree's own randomly generated id, never asserted as a fixed string.
 */
function header(tree: ReturnType<typeof traceTree>): string {
  const traceId = tree.traceId!;
  return `trace: ${humanName(traceId)} (${traceId.slice(0, 7)})\n\n`;
}

describe("renderIndentedText trace header", () => {
  test("opens with 'trace: <phrase> (<7 hex>)' plus a blank line, for a non-empty tree", () => {
    const tree = traceTree([traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [])]);
    const result = renderIndentedText(tree);
    expect(result.startsWith(header(tree))).toBe(true);
    expect(result).toMatch(/^trace: [a-z]+ [a-z]+ [a-z]+ \([0-9a-f]{7}\)\n\n/);
  });

  test("is silent (no header at all) on an empty tree — nothing here is invented", () => {
    const result = renderIndentedText(traceTree([]));
    expect(result).toBe("");
    expect(result).not.toContain("trace:");
  });
});

describe("renderIndentedText", () => {
  test("a redacted param renders the [REDACTED] marker, not the captured value", () => {
    const sig = methodSignature("Auth", "login", [parameterCapture("token", "SECRET", true)]);
    const result = renderIndentedText(traceTree([traceNode(sig, returned('"OK"'), [])]));
    expect(result).toContain("token: [REDACTED]");
    expect(result).not.toContain("SECRET");
  });

  test("single method renders as single line", () => {
    const sig = methodSignature("OrderService", "placeOrder", [
      parameterCapture("orderId", '"order-42"', false),
    ]);
    const node = traceNode(sig, returned('"OK"'), []);
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toBe(`${header(tree)}OrderService.placeOrder(orderId: "order-42") → "OK" #1`);
  });

  test("nested calls render as tree with box-drawing", () => {
    const child1 = traceNode(
      methodSignature("InventoryService", "reserve", [
        parameterCapture("productId", '"P1"', false),
      ]),
      returned("true"),
      [],
    );
    const child2 = traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "100", false)]),
      returned('"receipt-1"'),
      [],
    );
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), [
      child1,
      child2,
    ]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toBe(
      header(tree) +
        [
          'OrderService.placeOrder() → "OK" #1',
          '├── InventoryService.reserve(productId: "P1") → true #1.1',
          '└── PaymentService.charge(amount: 100) → "receipt-1" #1.2',
        ].join("\n"),
    );
  });

  test("error paths show error marker", () => {
    const node = traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "100", false)]),
      threw(new Error("insufficient funds")),
      [],
    );
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toBe(
      `${header(tree)}PaymentService.charge(amount: 100) ✗ Error: insufficient funds #1`,
    );
  });

  test("non-Error thrown renders as string", () => {
    const node = traceNode(methodSignature("Svc", "op", []), threw("raw error"), []);
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toContain("✗ string: raw error");
  });

  test("shows the exception type and error context pipe-delimited", () => {
    class NotFoundError extends Error {}
    const node = traceNode(
      methodSignature("Repo", "find", []),
      threw(new NotFoundError("missing"), "no such 42"),
      [],
    );
    const result = renderIndentedText(traceTree([node]));
    expect(result).toContain("✗ NotFoundError: missing | no such 42");
  });

  test("incomplete outcome renders hourglass marker", () => {
    const node = traceNode(methodSignature("Svc", "op", []), incomplete(), []);
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toContain("⏳ (incomplete)");
  });

  test("renders fork/join markers for concurrent children", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 50, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 120, 100, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("⑂ fork [2 tasks]");
    expect(result).toContain("↦ A.a()");
    expect(result).toContain("↦ B.b()");
    expect(result).toContain("⑃ join — 120ms");
  });

  // durationMs is measured with performance.now(), a sub-millisecond fractional float — printing
  // it raw broke the family-wide `— Nms` convention (2026-09-11 duration-format fix).
  test("join wall time rounds a fractional duration rather than printing it raw", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(
      methodSignature("A", "a", []),
      returned('"ok"'),
      [],
      0.5849169999999901,
      100,
      info1,
    );
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 0.2, 100, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);

    const result = renderIndentedText(traceTree([root]));

    expect(result).toContain("⑃ join — 0.58ms");
    expect(result).not.toContain("0.5849169999999901");
  });

  test("sorts concurrent members deterministically", () => {
    const info1 = concurrencyInfo("g1", "Z.z", "fork-join");
    const info2 = concurrencyInfo("g1", "A.a", "fork-join");
    const child1 = traceNode(methodSignature("Z", "z", []), returned('"ok"'), [], 10, 100, info1);
    const child2 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 10, 100, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);
    const lines = result.split("\n");
    const memberLines = lines.filter((l) => l.includes("↦"));

    expect(memberLines[0]).toContain("A.a");
    expect(memberLines[1]).toContain("Z.z");
  });

  test("renders fork-join with sequential sibling after (not-last branch)", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 10, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 10, 100, info2);
    const after = traceNode(methodSignature("Post", "run", []), returned('"done"'), []);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [
      child1,
      child2,
      after,
    ]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("├── ⑂ fork");
    expect(result).toContain("│   ↦");
    expect(result).toContain("├── ⑃ join");
    expect(result).toContain("└── Post.run()");
  });

  test("shows sequential-async annotation for non-overlapping fork-join tasks", () => {
    const info1 = concurrencyInfo("g1", "A.a", "fork-join");
    const info2 = concurrencyInfo("g1", "B.b", "fork-join");
    const child1 = traceNode(methodSignature("A", "a", []), returned('"ok"'), [], 50, 100, info1);
    const child2 = traceNode(methodSignature("B", "b", []), returned('"ok"'), [], 30, 200, info2);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child1, child2]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("[async, awaited sequentially]");
    expect(result).toContain("⚡ Sequential async");
  });

  test("renders fire-and-forget without fork/join markers", () => {
    const info = concurrencyInfo("fanf-1", "OrderService", "fire-and-forget");
    const marker = traceNode(
      methodSignature("OrderService", "⤳ fire-and-forget", []),
      returned(null),
      [],
      0,
      0,
      info,
    );
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [marker]);
    const tree = traceTree([root]);

    const result = renderIndentedText(tree);

    expect(result).toContain("⤳ fire-and-forget");
    expect(result).not.toContain("⑂ fork");
    expect(result).not.toContain("⑃ join");
  });

  test("void method omits return arrow", () => {
    const node = traceNode(
      methodSignature("Logger", "log", [parameterCapture("msg", '"hello"', false)]),
      returned(null),
      [],
    );
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);

    expect(result).toBe(`${header(tree)}Logger.log(msg: "hello") #1`);
  });

  // className/methodName/parameter names are trace metadata: unlike a captured value they are not
  // control-escaped upstream, so a hostile one reaching a renderer raw would inject an extra line
  // (cross-runtime shape F4, 2026-09-02 audit). The header is fixed, well-formed text unrelated to
  // this hostile metadata, so it is stripped before counting lines (Java parity: the header line
  // change updated this same assertion in RendererMetadataEscapingTest).
  test("a control character in className/methodName/a parameter name does not inject an extra line", () => {
    const sig = methodSignature("A\nB", "c\nd", [parameterCapture("e\nf", '"v"', false)]);
    const node = traceNode(sig, returned('"OK"'), []);
    const tree = traceTree([node]);

    const result = renderIndentedText(tree);
    const body = result.slice(header(tree).length);

    expect(body.split("\n")).toHaveLength(1);
    expect(body).toBe('A\\nB.c\\nd(e\\nf: "v") → "OK" #1');
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java canonical source).
describe("bounded call-tree walk (cyclic and very deep trees)", () => {
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

  test("does not crash on a cyclic tree, and marks the cycle instead of looping forever", () => {
    expect(renderIndentedText(traceTree([cyclicRoot()]))).toContain("… (cycle)");
  });

  // Shrunk from a 50,000-deep chain to just past the walker's own depth limit (10,000): the walk
  // is non-recursive and stops at the limit regardless of how much chain lies beyond it, so a
  // chain one link longer than the limit exercises the identical code path. vitest's default
  // 5000ms per-test timeout is a wall-clock budget, and release retrospective rule 3 says that
  // budget must never be implicit — a test whose legitimate cost varies with scheduler contention
  // declares what it actually needs, and a hang guard on a non-timing test takes a seconds-scale
  // floor, never a millisecond-scale tolerance. 3000ms is the floor.
  // Phase 7 (2026-10-10): every line now cites its position-path span id, and at depth d that id
  // is d segments long, so this chain's output is O(depth²) in EVERY flavour (100–300M chars at
  // the 10,000 cap, measured 2.8–4.5s run alone; Java's format and cap are the same). The 5x
  // rule above gives 20000ms. A citable-depth bound is an open question for the format.
  test("does not stack-overflow on a chain just past the depth limit, and marks it", () => {
    expect(renderIndentedText(traceTree([deepChain(10_001)]))).toContain("… (depth limit)");
  }, 20_000);

  test("an ordinary tree well within the bound renders exactly as before", () => {
    const child = traceNode(methodSignature("Repo", "find", []), returned('"found"'), []);
    const root = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [child]);
    const tree = traceTree([root]);
    expect(renderIndentedText(tree)).toBe(
      `${header(tree)}Svc.op() → "ok" #1\n└── Repo.find() → "found" #1.1`,
    );
  });
});

describe("citable span ids — the same id the structural trace gives the same call", () => {
  test("fork members cite the ids their Class.method order gives them", () => {
    const g = (cls: string) => concurrencyInfo("g1", `${cls}.run`, "fork-join");
    const zeta = traceNode(methodSignature("Zeta", "run", []), returned(null), [], 5, 0, g("Zeta"));
    const alpha = traceNode(
      methodSignature("Alpha", "run", []),
      returned(null),
      [],
      5,
      0,
      g("Alpha"),
    );
    const root = traceNode(methodSignature("Svc", "op", []), returned(null), [zeta, alpha]);
    const result = renderIndentedText(traceTree([root]));
    expect(result).toContain("↦ Alpha.run() #1.1");
    expect(result).toContain("↦ Zeta.run() #1.2");
  });

  test("a fire-and-forget worker cites its position under the launch", () => {
    const info = concurrencyInfo("f1", "Mail.send", "fire-and-forget");
    const worker = traceNode(methodSignature("Mail", "send", []), returned(null), [], 1, 0, info);
    const after = traceNode(methodSignature("Svc", "close", []), returned(null), []);
    const root = traceNode(methodSignature("Svc", "op", []), returned(null), [worker, after]);
    const result = renderIndentedText(traceTree([root]));
    expect(result).toContain("Mail.send() #1.1.1");
    expect(result).toContain("Svc.close() #1.2");
  });

  test("a node the walk stopped at still cites its own id; the marker line cites none", () => {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned(null),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    const result = renderIndentedText(traceTree([self as unknown as ReturnType<typeof traceNode>]));
    expect(result).toContain("└── Svc.op() #1.1");
    expect(result).toMatch(/… \(cycle\)$/);
  });
});
