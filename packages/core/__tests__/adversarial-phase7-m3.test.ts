// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  CitableSpanId,
  ControlEscape,
  concurrencyInfo,
  isSubsequence,
  methodSignature,
  parameterCapture,
  returned,
  structuralDelta,
  type TraceNode,
  threw,
  traceNode,
  traceTree,
  unifiedLineDiff,
} from "../src/index.js";
import {
  renderStructural,
  renderStructuralDocument,
  structuralSubtreeKey,
} from "../src/structural-trace-renderer.js";

function call(cls: string, method: string, children: readonly TraceNode[] = []): TraceNode {
  return traceNode(methodSignature(cls, method, []), returned(null), children);
}

function member(cls: string, method: string, groupId: string): TraceNode {
  const info = concurrencyInfo(groupId, `${cls}.${method}`, "fork-join");
  return traceNode(methodSignature(cls, method, []), returned(null), [], 0, 0, info);
}

function worker(cls: string, method: string, groupId: string): TraceNode {
  const info = concurrencyInfo(groupId, `${cls}.${method}`, "fire-and-forget");
  return traceNode(methodSignature(cls, method, []), returned(null), [], 0, 0, info);
}

/** The ids of the call lines a rendered `.nt` prints, in print order. */
function printedCallIds(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.includes(" - "))
    .map((line) => CitableSpanId.of(line) as string);
}

describe("CitableSpanId — fork members ordered by the concatenated Class.method key", () => {
  test("Ab.c sorts after A.bc because the key is the joined string, not class then method", () => {
    // Joined keys: "Ab.c" and "A.bc". Code unit '.' (46) < 'b' (98), so "A.bc" ranks first.
    const siblings = [member("Ab", "c", "g"), member("A", "bc", "g")];
    expect(CitableSpanId.idsOf(siblings, null)).toEqual(["#2", "#1"]);
  });
});

describe("CitableSpanId.idsOf — a mixed sibling list keeps every position contiguous", () => {
  test("a call, a fork, a fire-and-forget launch and a call take contiguous positions", () => {
    const siblings = [
      call("A", "a"),
      member("B", "z", "f"),
      member("B", "a", "f"),
      worker("W", "one", "w"),
      worker("W", "two", "w"),
      call("C", "c"),
    ];
    expect(CitableSpanId.idsOf(siblings, null)).toEqual(["#1", "#3", "#2", "#4.1", "#4.2", "#5"]);
  });
});

describe("CitableSpanId.citedOps — the render operations carry the same ids", () => {
  test("a fork-join op lists its members with capture-order ids, between plain nodes", () => {
    const siblings = [call("A", "a"), member("B", "z", "f"), member("B", "a", "f")];
    const ops = CitableSpanId.citedOps(siblings, null);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ kind: "node", id: "#1" });
    const fork = ops[1];
    if (fork?.kind !== "fork-join") throw new Error("expected a fork-join op");
    expect(fork.members.map((m) => [m.node.signature.methodName, m.id])).toEqual([
      ["z", "#3"],
      ["a", "#2"],
    ]);
  });
});

describe("structural renderer — layout and ids for a fork and a launch", () => {
  const roots = [
    call("A", "a"),
    member("B", "z", "f"),
    member("B", "a", "f"),
    worker("W1", "run", "w"),
    worker("W2", "run", "w"),
    call("C", "c"),
  ];

  test("a fork and a fire-and-forget launch between calls print the spec layout and ids", () => {
    expect(renderStructural(traceTree(roots))).toBe(
      [
        "#1 - A.a()",
        "~ fork [2]",
        "  #2 - B.a()",
        "  #3 - B.z()",
        "#4 ~ fire-and-forget",
        "  #4.1 - W1.run()",
        "  #4.2 - W2.run()",
        "#5 - C.c()",
        "",
      ].join("\n"),
    );
  });

  test("the call ids the renderer prints are exactly the ids idsOf gives the nodes", () => {
    // Print order is Class.method order inside a fork, capture order is idsOf's: compare as sets.
    expect(printedCallIds(renderStructural(traceTree(roots))).sort()).toEqual(
      [...CitableSpanId.idsOf(roots, null)].sort(),
    );
  });

  test("members sharing Class.method keep capture order when their outcomes differ", () => {
    const info = concurrencyInfo("g", "Mail.send", "fork-join");
    const first = traceNode(methodSignature("Mail", "send", []), returned(null), [], 0, 0, info);
    const second = traceNode(
      methodSignature("Mail", "send", []),
      threw(new Error("smtp down")),
      [],
      0,
      0,
      info,
    );
    const text = renderStructural(traceTree([call("Root", "go", [first, second])]));
    expect(text).toBe(
      "#1 - Root.go()\n  ~ fork [2]\n    #1.1 - Mail.send()\n    #1.2 - Mail.send() !! Error\n",
    );
  });

  test("a child of a launched worker nests under the worker's own id", () => {
    const info = concurrencyInfo("f", "Mail.send", "fire-and-forget");
    const launched = traceNode(
      methodSignature("Mail", "send", []),
      returned(null),
      [call("Db", "write")],
      0,
      0,
      info,
    );
    expect(renderStructural(traceTree([launched]))).toBe(
      "#1 ~ fire-and-forget\n  #1.1 - Mail.send()\n    #1.1.1 - Db.write()\n",
    );
  });

  // Adversarial pass finding, INVERTED on review: the root of a key prints no id, its children are
  // numbered as roots — the Java reference's `subtreeKey` does the same. Ids are positional, so two
  // equal shapes still give equal keys wherever they sit; the doc comment now says so.
  test("a subtree key prints no id for its root and numbers its children as roots", () => {
    const key = structuralSubtreeKey(call("A", "a", [call("C", "c")]));
    expect(key).toBe("- A.a()\n  #1 - C.c()\n");
  });

  test("a method and a parameter name carrying line separators print escaped, never raw", () => {
    const node = traceNode(
      methodSignature("A", "run\u2029now", [parameterCapture("x\u2028y", '"v"', false)]),
      returned(null),
      [],
    );
    const text = renderStructural(traceTree([node]));
    expect(text).toBe("#1 - A.run\\u2029now(x\\u2028y)\n");
    expect(text).not.toMatch(/[\u2028\u2029]/);
  });
});

describe("ControlEscape.sanitize — line separators beside other controls", () => {
  test("a separator between two mnemonic controls escapes alone, mnemonics intact", () => {
    expect(ControlEscape.sanitize("\n\u2028\t")).toBe("\\n\\u2028\\t");
  });

  test("NEL and DEL are escaped while NBSP stays as written", () => {
    expect(ControlEscape.sanitize("\u0085\u007f\u00a0")).toBe("\\u0085\\u007f\u00a0");
  });

  test("sanitizing already-escaped output changes nothing", () => {
    const once = ControlEscape.sanitize("a \n\u0007\u2028b");
    expect(ControlEscape.sanitize(once)).toBe(once);
  });
});

describe("structuralDelta — line endings, ids and counts at their edges", () => {
  test("a lone CR line ending is an encoding, not a structural change", () => {
    expect(structuralDelta("scenario: x\r- A.b()\r", "scenario: x\n- A.b()\n").unchanged).toBe(
      true,
    );
  });

  test("a CRLF id-free baseline with no final newline matches an LF run that carries ids", () => {
    const delta = structuralDelta("scenario: x\r\n\r\n- A.b()", "scenario: x\n\n#1 - A.b()\n");
    expect(delta.unchanged).toBe(true);
    expect(delta.diff).toBe("");
  });

  test("a call replaced by another reports both sides of the net change per signature", () => {
    const delta = structuralDelta("#1 - A.a()\n#2 - B.b()\n", "#1 - A.a()\n#2 - A.a()\n");
    expect(delta.summary).toBe("+1 call A.a, -1 call B.b");
  });

  test("a reorder with identical call counts summarizes as structure changed", () => {
    const delta = structuralDelta("#1 - A.a()\n#2 - B.b()\n", "#1 - B.b()\n#2 - A.a()\n");
    expect(delta.unchanged).toBe(false);
    expect(delta.summary).toBe("structure changed");
  });

  test("a CRLF current document that only omits a line is still an omission", () => {
    const delta = structuralDelta(
      "#1 - A.a()\n#2 - B.b()\n#3 - C.c()\n",
      "#1 - A.a()\r\n#2 - C.c()\r\n",
    );
    expect(delta.onlyOmits).toBe(true);
    expect(delta.unchanged).toBe(false);
  });
});

describe("unifiedLineDiff and isSubsequence — ties, duplicates and keys", () => {
  test("a replaced line in the middle prints its removal before its insertion", () => {
    expect(unifiedLineDiff("a\nb\nc\nd\n", "a\nx\nc\nd\n")).toBe(" a\n-b\n+x\n c\n d\n");
  });

  test("a duplicated baseline line against one current copy removes exactly one", () => {
    expect(unifiedLineDiff("x\nx\n", "x\n")).toBe(" x\n-x\n");
  });

  test("a repeated baseline line is a subsequence only up to its count", () => {
    expect(isSubsequence("a\nb\na\n", "a\na\n")).toBe(true);
    expect(isSubsequence("a\nb\na\n", "a\na\na\n")).toBe(false);
  });
});
