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
import { renderPlantUmlSequence } from "../src/plantuml-sequence.js";

describe("renderPlantUmlSequence", () => {
  test("folds control chars in a return value so it cannot inject an !include directive", () => {
    const node = traceNode(
      methodSignature("Svc", "op", []),
      returned('"ok"\n!include /etc/passwd'),
      [],
    );
    const out = renderPlantUmlSequence(traceTree([node]));
    expect(out.split("\n").some((l) => l.trimStart().startsWith("!include"))).toBe(false);
  });

  test("empty tree produces startuml/enduml wrapper only", () => {
    const tree = traceTree([]);

    const result = renderPlantUmlSequence(tree);

    expect(result).toBe("@startuml\n@enduml");
  });

  test("single call produces participant, activation, and return note", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("orderId", '"order-42"', false),
      ]),
      returned('"OK"'),
      [],
    );
    const tree = traceTree([node]);

    const result = renderPlantUmlSequence(tree);

    expect(result).toBe(
      [
        "@startuml",
        // PlantUML's documented syntax is `participant <label> as <alias>` — display name
        // first (plantuml.com/sequence-diagram, "Declaring participant"), the reverse of
        // Mermaid's `participant <id> as <label>` (mermaid.js.org, alias first). Quoted only
        // when the display name needs it (DiagramLabel.quoted) — "OrderService" does not.
        "  participant OrderService as OS",
        '  OS -> OS : placeOrder(orderId: "order-42")',
        "  activate OS",
        '  OS --> OS : "OK"',
        "  deactivate OS",
        "@enduml",
      ].join("\n"),
    );
  });

  test("nested calls show correct arrow directions and return values", () => {
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

    const result = renderPlantUmlSequence(tree);

    expect(result).toBe(
      [
        "@startuml",
        "  participant OrderService as OS",
        "  participant InventoryService as IS",
        "  OS -> OS : placeOrder()",
        "  activate OS",
        '  OS -> IS : reserve(productId: "P1")',
        "  activate IS",
        "  IS --> OS : true",
        "  deactivate IS",
        '  OS --> OS : "OK"',
        "  deactivate OS",
        "@enduml",
      ].join("\n"),
    );
  });

  test("error paths use red arrows with the exception type name", () => {
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

    const result = renderPlantUmlSequence(tree);

    expect(result).toContain("PS -[#red]-> OS : Error");
    // root exception self-arrows in red with the exception type
    expect(result).toContain("OS -[#red]-> OS : Error");
  });

  test("alias collision falls back to first-2-chars then digit suffix", () => {
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

    const result = renderPlantUmlSequence(tree);
    const participantLines = result.split("\n").filter((l) => l.includes("participant"));

    expect(participantLines).toHaveLength(4);
    expect(result).toContain("as CL");
    expect(result).toContain("as CL2");
    expect(result).toContain("as CL3");
  });

  test("multiple calls to same class produce only one participant", () => {
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

    const result = renderPlantUmlSequence(tree);

    const participantLines = result.split("\n").filter((l) => l.includes("participant"));
    expect(participantLines).toHaveLength(2);
    expect(participantLines[0]).toContain("OrderService");
    expect(participantLines[1]).toContain("InventoryService");
  });

  test("deep nesting produces correct activate/deactivate pairs", () => {
    const grandchild = traceNode(methodSignature("Database", "query", []), returned('"row"'), []);
    const child = traceNode(methodSignature("InventoryService", "reserve", []), returned("true"), [
      grandchild,
    ]);
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned('"OK"'), [
      child,
    ]);
    const tree = traceTree([root]);

    const result = renderPlantUmlSequence(tree);

    expect(result).toBe(
      [
        "@startuml",
        "  participant OrderService as OS",
        "  participant InventoryService as IS",
        "  participant Database as DA",
        "  OS -> OS : placeOrder()",
        "  activate OS",
        "  OS -> IS : reserve()",
        "  activate IS",
        "  IS -> DA : query()",
        "  activate DA",
        '  DA --> IS : "row"',
        "  deactivate DA",
        "  IS --> OS : true",
        "  deactivate IS",
        '  OS --> OS : "OK"',
        "  deactivate OS",
        "@enduml",
      ].join("\n"),
    );
  });

  test("void return omits return arrow but keeps activation bars", () => {
    const child = traceNode(methodSignature("InventoryService", "reserve", []), returned(null), []);
    const root = traceNode(methodSignature("OrderService", "placeOrder", []), returned(null), [
      child,
    ]);
    const tree = traceTree([root]);

    const result = renderPlantUmlSequence(tree);

    expect(result).not.toContain("-->");
    expect(result).not.toContain("note right of");
    expect(result).toContain("activate OS");
    expect(result).toContain("deactivate OS");
    expect(result).toContain("activate IS");
    expect(result).toContain("deactivate IS");
  });

  test("non-Error thrown renders with its typeof as the type name", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", []),
      threw("raw error"),
      [],
    );
    const tree = traceTree([node]);

    const result = renderPlantUmlSequence(tree);

    expect(result).toContain("OS -[#red]-> OS : string");
  });

  test("incomplete outcome renders as an hnote lifeline marker, not an arrow", () => {
    const node = traceNode(methodSignature("OrderService", "place", []), incomplete(), []);
    const tree = traceTree([node]);

    const result = renderPlantUmlSequence(tree);

    expect(result).toContain("hnote over OS : in-flight");
    expect(result).not.toContain("(incomplete)");
  });

  test("empty className produces a non-blank participant alias", () => {
    const tree = traceTree([
      traceNode(methodSignature("", "placeOrder", []), returned('"OK"'), []),
    ]);

    const result = renderPlantUmlSequence(tree);
    const lines = result.split("\n");

    const participantLine = lines.find((l) => l.includes("participant"));
    expect(participantLine).toBeDefined();
    expect(participantLine).toMatch(/participant \S+/);
  });

  test("empty className shows the <unnamed> marker rather than a blank display name", () => {
    const tree = traceTree([
      traceNode(methodSignature("", "placeOrder", []), returned('"OK"'), []),
    ]);

    expect(renderPlantUmlSequence(tree)).toContain('participant "<unnamed>" as');
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

    const result = renderPlantUmlSequence(hostile);

    expect(result.split("\n")).toHaveLength(renderPlantUmlSequence(benign).split("\n").length);
    expect(result).toContain('participant "A B" as');
  });

  test("a quote in className cannot break out of the quoted display name", () => {
    const benign = traceTree([
      traceNode(methodSignature("AB", "placeOrder", []), returned('"OK"'), []),
    ]);
    const hostile = traceTree([
      traceNode(methodSignature('A"B', "placeOrder", []), returned('"OK"'), []),
    ]);

    const result = renderPlantUmlSequence(hostile);

    expect(result.split("\n")).toHaveLength(renderPlantUmlSequence(benign).split("\n").length);
    expect(result).not.toContain('A"B');
    expect(result).toContain("A'B");
  });

  test("a Mermaid-style comment opener in className is not left as a bare %%", () => {
    const tree = traceTree([
      traceNode(methodSignature("A%%B", "placeOrder", []), returned('"OK"'), []),
    ]);

    const participantLine = renderPlantUmlSequence(tree)
      .split("\n")
      .find((l) => l.includes("participant"));

    expect(participantLine).toContain("A% %B");
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
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
    expect(renderPlantUmlSequence(traceTree([cyclicRoot()]))).toContain("… (cycle)");
  });

  test("does not stack-overflow on a very deep chain, and marks the depth limit", () => {
    expect(renderPlantUmlSequence(traceTree([deepChain(50_000)]))).toContain("… (depth limit)");
  });
});

// Same fix, same shared sequence-walk traversal, as mermaid-sequence.test.ts's own
// "participant alias hostile class names" block — see that file for the full rationale.
describe("participant alias hostile class names (renderPlantUmlSequence)", () => {
  const SAFE_ALIAS = /^[\p{L}\p{N}_]+$/u;

  // Excludes the `participant` declaration line — its quoted display name can itself contain
  // "->>" when the raw class name does, which is exactly the case these tests exercise.
  function callArrowEndpoints(result: string): [caller: string, target: string] {
    const arrowLine = result
      .split("\n")
      .find((l) => !l.trim().startsWith("participant") && l.includes(" -> "));
    if (arrowLine === undefined) throw new Error("no call arrow line found");
    const [caller, rest] = arrowLine.trim().split(" -> ");
    const [target] = rest.split(" : ");
    return [caller, target];
  }

  test("an arrow fragment in an all-lowercase class name does not split the call arrow", () => {
    const benign = renderPlantUmlSequence(
      traceTree([traceNode(methodSignature("svc", "m", []), returned('"ok"'), [])]),
    );
    const hostile = renderPlantUmlSequence(
      traceTree([traceNode(methodSignature("a->>b", "m", []), returned('"ok"'), [])]),
    );

    expect(hostile.split("\n")).toHaveLength(benign.split("\n").length);
    const [caller, target] = callArrowEndpoints(hostile);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("a colon in an all-lowercase class name does not shift the arrow's message boundary", () => {
    const result = renderPlantUmlSequence(
      traceTree([traceNode(methodSignature("a:b", "m", []), returned('"ok"'), [])]),
    );

    const [caller, target] = callArrowEndpoints(result);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("an @ in an all-lowercase class name does not survive into the bare alias", () => {
    const result = renderPlantUmlSequence(
      traceTree([traceNode(methodSignature("a@b", "m", []), returned('"ok"'), [])]),
    );

    const [caller, target] = callArrowEndpoints(result);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("empty className gets a non-blank, grammar-safe bare alias", () => {
    const result = renderPlantUmlSequence(
      traceTree([traceNode(methodSignature("", "m", []), returned('"ok"'), [])]),
    );

    const [caller, target] = callArrowEndpoints(result);
    expect(caller).toMatch(SAFE_ALIAS);
    expect(target).toMatch(SAFE_ALIAS);
  });

  test("two class names that only differ in a character the alias sanitizer strips still get distinct participant lanes", () => {
    const child = traceNode(methodSignature("a;b", "n", []), returned('"y"'), []);
    const root = traceNode(methodSignature("a:b", "m", []), returned('"x"'), [child]);

    const result = renderPlantUmlSequence(traceTree([root]));
    const aliases = result
      .split("\n")
      .filter((l) => l.includes("participant"))
      .map(
        // Display-name first, then the alias (`participant "<display>" as <alias>`) — the
        // 2026-09-13 ordering fix; the alias is the second token, not the first.
        (l) =>
          l
            .trim()
            .replace(/^participant /, "")
            .split(" as ")[1],
      );

    expect(aliases).toHaveLength(2);
    expect(new Set(aliases).size).toBe(2);
    for (const alias of aliases) expect(alias).toMatch(SAFE_ALIAS);
  });

  // See mermaid-sequence.test.ts's own version of this test for the full rationale: a genuine,
  // verified cross-runtime difference from the Java/Python reference, not a claimed fix.
  test("a class literally named 'end' does not alias to the bare reserved word", () => {
    const result = renderPlantUmlSequence(
      traceTree([traceNode(methodSignature("end", "m", []), returned('"ok"'), [])]),
    );

    const [caller] = callArrowEndpoints(result);
    expect(caller).not.toBe("end");
  });
});
