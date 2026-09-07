// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  incomplete,
  methodSignature,
  parameterCapture,
  returned,
  type TraceNode,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { renderMermaidSequence } from "../src/mermaid-sequence.js";

describe("renderMermaidSequence", () => {
  test("folds control chars in a return value so it cannot inject a directive line", () => {
    const node = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"\nclick Svc "http://evil"'),
      [],
    );
    const out = renderMermaidSequence(traceTree([node]));
    const responseLine = out.split("\n").find((l) => l.includes("ok"));
    expect(responseLine).toBeDefined();
    // no physical line begins with an injected `click` directive
    expect(out.split("\n").some((l) => l.trimStart().startsWith("click "))).toBe(false);
  });

  test("single call produces participant and message", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("orderId", '"order-42"', false),
      ]),
      returned('"OK"'),
      [],
    );
    const tree = traceTree([node]);

    const result = renderMermaidSequence(tree);

    expect(result).toBe(
      [
        "sequenceDiagram",
        "  participant OS as OrderService",
        '  OS->>OS: placeOrder(orderId: "order-42")',
        '  OS-->>OS: "OK"',
      ].join("\n"),
    );
  });

  test("nested calls show correct arrow directions", () => {
    const child = traceNode(
      methodSignature("InventoryService", "reserve", [
        parameterCapture("productId", '"P1"', false),
      ]),
      returned("true"),
      [],
    );
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), [
      child,
    ]);
    const tree = traceTree([root]);

    const result = renderMermaidSequence(tree);

    expect(result).toBe(
      [
        "sequenceDiagram",
        "  participant OS as OrderService",
        "  participant IS as InventoryService",
        "  OS->>OS: placeOrder()",
        '  OS->>IS: reserve(productId: "P1")',
        "  IS-->>OS: true",
        '  OS-->>OS: "OK"',
      ].join("\n"),
    );
  });

  test("error paths use -x notation and the exception type name", () => {
    const child = traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "100", false)]),
      threw(new Error("insufficient funds")),
      [],
    );
    const root = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      threw(new Error("order failed")),
      [child],
    );
    const tree = traceTree([root]);

    const result = renderMermaidSequence(tree);

    expect(result).toContain("PS-xOS: Error");
    // root exception self-arrows with the exception type name
    expect(result).toContain("OS-xOS: Error");
    expect(result).not.toContain("--x");
  });

  test("alias collision falls back to first-2-chars then digit suffix", () => {
    // CloudLift → uppers "CL" → alias "CL"
    // ClearLog → uppers "CL" (collision) → fallback "CL" (collision) → "CL2"
    // CleanLayout → uppers "CL" (collision) → fallback "CL" (collision) → "CL2" (collision) → "CL3"
    const child1 = traceNode(methodSignature("ClearLog", "write", []), returned("undefined"), []);
    const child2 = traceNode(methodSignature("CloudLift", "deploy", []), returned("undefined"), []);
    const child3 = traceNode(
      methodSignature("CleanLayout", "render", []),
      returned("undefined"),
      [],
    );
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), [
      child1,
      child2,
      child3,
    ]);
    const tree = traceTree([root]);

    const result = renderMermaidSequence(tree);
    const participantLines = result.split("\n").filter((l) => l.includes("participant"));

    expect(participantLines).toHaveLength(4);
    expect(result).toContain("CL as");
    expect(result).toContain("CL2 as");
    expect(result).toContain("CL3 as");
  });

  test("non-Error thrown renders with its typeof as the type name", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      threw("raw error"),
      [],
    );
    const tree = traceTree([node]);

    const result = renderMermaidSequence(tree);

    expect(result).toContain("OS-xOS: string");
  });

  test("quotes a participant display name containing special characters", () => {
    const node = traceNode(methodSignature("Order Service", "place", []), returned('"OK"'), []);
    const result = renderMermaidSequence(traceTree([node]));
    expect(result).toContain('as "Order Service"');
  });

  test("incomplete outcome renders as a lifeline note, not an arrow", () => {
    const node = traceNode(methodSignature("OrderService", "place", []), incomplete(), []);
    const tree = traceTree([node]);

    const result = renderMermaidSequence(tree);

    expect(result).toContain("Note over OS: in-flight");
    expect(result).not.toContain("(incomplete)");
    expect(result).not.toContain("-x");
  });

  test("class with no uppercase letters uses first-2-chars fallback", () => {
    const node = traceNode(methodSignature("orders", "place", []), returned('"OK"'), []);
    const tree = traceTree([node]);

    const result = renderMermaidSequence(tree);

    expect(result).toContain("participant OR as orders");
  });

  test("null return value omits return arrow", () => {
    const child = traceNode(methodSignature("InventoryService", "reserve", []), returned(null), []);
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned(null), [
      child,
    ]);
    const tree = traceTree([root]);

    const result = renderMermaidSequence(tree);

    expect(result).not.toContain("-->>");
    expect(result).not.toContain("Note right of");
  });

  test("multiple participants are deduped", () => {
    const child1 = traceNode(
      methodSignature("InventoryService", "reserve", []),
      returned("true"),
      [],
    );
    const child2 = traceNode(
      methodSignature("InventoryService", "confirm", []),
      returned("undefined"),
      [],
    );
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), [
      child1,
      child2,
    ]);
    const tree = traceTree([root]);

    const result = renderMermaidSequence(tree);

    const participantLines = result.split("\n").filter((l) => l.includes("participant"));
    expect(participantLines).toHaveLength(2);
    expect(participantLines[0]).toContain("OrderService");
    expect(participantLines[1]).toContain("InventoryService");
  });

  test("empty className produces a non-blank participant alias", () => {
    const tree = traceTree([
      traceNode(methodSignature("", "placeOrder", []), returned('"OK"'), []),
    ]);

    const result = renderMermaidSequence(tree);
    const lines = result.split("\n");

    const participantLine = lines.find((l) => l.includes("participant"));
    expect(participantLine).toBeDefined();
    expect(participantLine).toMatch(/participant \S+/);
  });

  test("empty className shows the <unnamed> marker rather than a blank display name", () => {
    const tree = traceTree([
      traceNode(methodSignature("", "placeOrder", []), returned('"OK"'), []),
    ]);

    expect(renderMermaidSequence(tree)).toContain('as "<unnamed>"');
  });

  // className is trace metadata, not a captured value — unlike a return value or parameter (both
  // already escaped via DiagramText.message), the participant display name and the alias token
  // derived from it were not (cross-port shape F4, 2026-09-02 audit).
  test("a control character in className does not inject an extra diagram statement", () => {
    const benign = traceTree([
      traceNode(methodSignature("AB", "placeOrder", []), returned('"OK"'), []),
    ]);
    const hostile = traceTree([
      traceNode(methodSignature("A\nB", "placeOrder", []), returned('"OK"'), []),
    ]);

    const result = renderMermaidSequence(hostile);

    expect(result.split("\n")).toHaveLength(renderMermaidSequence(benign).split("\n").length);
    expect(result).toContain('as "A B"');
  });

  test("a quote in className cannot break out of the quoted display name", () => {
    const benign = traceTree([
      traceNode(methodSignature("AB", "placeOrder", []), returned('"OK"'), []),
    ]);
    const hostile = traceTree([
      traceNode(methodSignature('A"B', "placeOrder", []), returned('"OK"'), []),
    ]);

    const result = renderMermaidSequence(hostile);

    expect(result.split("\n")).toHaveLength(renderMermaidSequence(benign).split("\n").length);
    expect(result).not.toContain('A"B');
    expect(result).toContain("A'B");
  });

  test("a Mermaid comment opener in className cannot suppress the rest of the line", () => {
    const tree = traceTree([
      traceNode(methodSignature("A%%B", "placeOrder", []), returned('"OK"'), []),
    ]);

    const result = renderMermaidSequence(tree);
    const participantLine = result.split("\n").find((l) => l.includes("participant"));

    expect(participantLine).toContain("A% %B");
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-port mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded call-tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot(): TraceNode {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned('"ok"'),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as TraceNode;
  }

  function deepChain(length: number): TraceNode {
    let node = traceNode(methodSignature("Leaf", "op", []), returned('"ok"'), []);
    for (let i = 0; i < length; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [node]);
    }
    return node;
  }

  test("does not crash on a cyclic tree, and marks the cycle instead of looping forever", () => {
    expect(renderMermaidSequence(traceTree([cyclicRoot()]))).toContain("… (cycle)");
  });

  test("does not stack-overflow on a very deep chain, and marks the depth limit", () => {
    expect(renderMermaidSequence(traceTree([deepChain(50_000)]))).toContain("… (depth limit)");
  });
});
