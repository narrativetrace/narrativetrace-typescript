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
  // derived from it were not (cross-runtime shape F4, 2026-09-02 audit).
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

// The alias sits in grammar position — unquoted, on the `participant X as Name` declaration and
// on every arrow line naming it — unlike the (quotable) display name `identifier()` already made
// safe. A class named `a->>b` used to produce the bare token `->`, splitting the call arrow into
// the wrong number of tokens; `a:b` produced `A:`, shifting the arrow's message boundary. Fixed by
// routing every alias candidate through `DiagramLabel.alias` (see alias-generator.test.ts for the
// generator-level case table); these prove the same fix end to end, through the renderer.
describe("participant alias hostile class names (renderMermaidSequence)", () => {
  const SAFE_ALIAS = /^[\p{L}\p{N}_]+$/u;

  // Excludes the `participant` declaration line — its quoted display name can itself contain
  // "->>" when the raw class name does, which is exactly the case these tests exercise.
  function callArrowEndpoints(result: string): [caller: string, target: string] {
    const arrowLine = result
      .split("\n")
      .find((l) => !l.trim().startsWith("participant") && l.includes("->>"));
    if (arrowLine === undefined) throw new Error("no call arrow line found");
    const [caller, rest] = arrowLine.trim().split("->>");
    const [target] = rest.split(": ");
    return [caller, target];
  }

  test("an arrow fragment in an all-lowercase class name does not split the call arrow", () => {
    const benign = renderMermaidSequence(
      traceTree([traceNode(methodSignature("svc", "m", []), returned('"ok"'), [])]),
    );
    const hostile = renderMermaidSequence(
      traceTree([traceNode(methodSignature("a->>b", "m", []), returned('"ok"'), [])]),
    );

    expect(hostile.split("\n")).toHaveLength(benign.split("\n").length);
    const [caller, target] = callArrowEndpoints(hostile);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("a colon in an all-lowercase class name does not shift the arrow's message boundary", () => {
    const result = renderMermaidSequence(
      traceTree([traceNode(methodSignature("a:b", "m", []), returned('"ok"'), [])]),
    );

    const [caller, target] = callArrowEndpoints(result);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("an @ in an all-lowercase class name does not survive into the bare alias", () => {
    const result = renderMermaidSequence(
      traceTree([traceNode(methodSignature("a@b", "m", []), returned('"ok"'), [])]),
    );

    const [caller, target] = callArrowEndpoints(result);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("empty className gets a non-blank, grammar-safe bare alias", () => {
    const result = renderMermaidSequence(
      traceTree([traceNode(methodSignature("", "m", []), returned('"ok"'), [])]),
    );

    const [caller, target] = callArrowEndpoints(result);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("two class names that only differ in a character the alias sanitizer strips still get distinct participant lanes", () => {
    // `a:b` and `a;b` produce different raw candidates ("A:" / "A;") but the same sanitized token
    // ("A") — collision detection must run on the sanitized token, or the diagram would show two
    // distinct classes sharing one lane.
    const child = traceNode(methodSignature("a;b", "n", []), returned('"y"'), []);
    const root = traceNode(methodSignature("a:b", "m", []), returned('"x"'), [child]);

    const result = renderMermaidSequence(traceTree([root]));
    const aliases = result
      .split("\n")
      .filter((l) => l.includes("participant"))
      .map(
        (l) =>
          l
            .trim()
            .replace(/^participant /, "")
            .split(" as ")[0],
      );

    expect(aliases).toHaveLength(2);
    expect(new Set(aliases).size).toBe(2);
    for (const alias of aliases) expect(alias).toMatch(SAFE_ALIAS);
  });

  // Mermaid's own reserved words (`end`, `participant`, ...) as a bare alias are a known
  // limitation shared by the Java reference, whose no-uppercase fallback is the *entire* raw name
  // (filtered to the same charset) — a class literally named `end` never had its length reduced,
  // so it keeps that full reserved word as its alias there. This runtime's alias candidates are
  // always a 2-character initials/prefix abbreviation, never the whole name, so a 3+ character
  // reserved word cannot survive intact here — verified below, not merely assumed. Not a
  // regression from this fix and not claimed fixed either; documented as a genuine cross-runtime
  // difference in alias-generator.test.ts's own case for this.
  test("a class literally named 'end' does not alias to the bare reserved word", () => {
    const result = renderMermaidSequence(
      traceTree([traceNode(methodSignature("end", "m", []), returned('"ok"'), [])]),
    );

    const [caller] = callArrowEndpoints(result);
    expect(caller).not.toBe("end");
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java canonical source).
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

  // Shrunk from a 50,000-deep chain to just past the walker's own depth limit (10,000): the walk
  // is non-recursive and stops at the limit regardless of how much chain lies beyond it, so a
  // chain one link longer than the limit exercises the identical code path — measured ~89ms run
  // alone in the dev container. vitest's default 5000ms per-test timeout is a wall-clock budget,
  // and release retrospective rule 3 says that budget must never be implicit — a test whose
  // legitimate cost varies with scheduler contention declares what it actually needs, and a hang
  // guard on a non-timing test takes a seconds-scale floor, never a millisecond-scale tolerance
  // close enough to the measured run to mistake ordinary contention for a hang. 3000ms is both
  // well past 5x the measured idle run and the floor itself.
  test("does not stack-overflow on a chain just past the depth limit, and marks it", () => {
    expect(renderMermaidSequence(traceTree([deepChain(10_001)]))).toContain("… (depth limit)");
  }, 3_000);
});
