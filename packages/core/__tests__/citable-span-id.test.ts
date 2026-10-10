// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  CitableSpanId,
  concurrencyInfo,
  methodSignature,
  returned,
  type TraceNode,
  traceNode,
} from "../src/index.js";

function call(cls: string, method: string, children: readonly TraceNode[] = []): TraceNode {
  return traceNode(methodSignature(cls, method, []), returned(null), children);
}

function member(cls: string, method: string, groupId: string, kind: "fork-join" | "async") {
  const info = concurrencyInfo(groupId, `${cls}.${method}`, kind);
  return traceNode(methodSignature(cls, method, []), returned(null), [], 0, 0, info);
}

function worker(cls: string, method: string, groupId: string): TraceNode {
  const info = concurrencyInfo(groupId, `${cls}.${method}`, "fire-and-forget");
  return traceNode(methodSignature(cls, method, []), returned(null), [], 0, 0, info);
}

describe("CitableSpanId.child — a position path, never a value", () => {
  test("a root is its 1-based position", () => {
    expect(CitableSpanId.child(null, 2)).toBe("#2");
  });

  test("a child appends its position to its parent's path", () => {
    expect(CitableSpanId.child("#1.3", 2)).toBe("#1.3.2");
  });
});

describe("CitableSpanId.idsOf — every sibling list numbered by segment", () => {
  test("plain calls take their capture-order positions", () => {
    expect(CitableSpanId.idsOf([call("A", "a"), call("B", "b")], "#1")).toEqual(["#1.1", "#1.2"]);
  });

  test("roots are numbered without a parent", () => {
    expect(CitableSpanId.idsOf([call("A", "a"), call("B", "b")], null)).toEqual(["#1", "#2"]);
  });

  test("fork members are numbered by Class.method, listed in capture order", () => {
    const siblings = [
      member("Stock", "check", "g", "fork-join"),
      member("Bal", "x", "g", "fork-join"),
    ];
    expect(CitableSpanId.idsOf(siblings, "#2")).toEqual(["#2.2", "#2.1"]);
  });

  test("async members are numbered by Class.method too", () => {
    const siblings = [member("Zeta", "z", "g", "async"), member("Alpha", "a", "g", "async")];
    expect(CitableSpanId.idsOf(siblings, null)).toEqual(["#2", "#1"]);
  });

  test("two members with the same Class.method keep capture order", () => {
    const first = member("Mail", "send", "g", "fork-join");
    const second = member("Mail", "send", "g", "fork-join");
    expect(CitableSpanId.idsOf([first, second], "#1")).toEqual(["#1.1", "#1.2"]);
  });

  test("a call after a fork continues past every member", () => {
    const siblings = [
      call("Before", "a"),
      member("B", "b", "g", "fork-join"),
      member("A", "a", "g", "fork-join"),
      call("After", "z"),
    ];
    expect(CitableSpanId.idsOf(siblings, "#1")).toEqual(["#1.1", "#1.3", "#1.2", "#1.4"]);
  });

  test("a fire-and-forget launch takes ONE position and its workers nest under it", () => {
    const siblings = [
      call("Checkout", "pay"),
      worker("Mail", "send", "f"),
      worker("Audit", "write", "f"),
      call("Checkout", "close"),
    ];
    expect(CitableSpanId.idsOf(siblings, "#1")).toEqual(["#1.1", "#1.2.1", "#1.2.2", "#1.3"]);
  });

  test("an empty sibling list has no ids", () => {
    expect(CitableSpanId.idsOf([], "#1")).toEqual([]);
  });

  test("two adjacent fire-and-forget groups are two launches", () => {
    const siblings = [worker("Mail", "send", "f1"), worker("Mail", "send", "f2")];
    expect(CitableSpanId.idsOf(siblings, null)).toEqual(["#1.1", "#2.1"]);
  });
});

describe("CitableSpanId.of / strip — reading an id back off a line", () => {
  test("reads the id a structural line opens with, after the indent", () => {
    expect(CitableSpanId.of("  #1.2 - A.b()")).toBe("#1.2");
  });

  test("a line without an id has none", () => {
    expect(CitableSpanId.of("  - A.b()")).toBeUndefined();
  });

  test("strip removes the id and its one space, keeping the indent", () => {
    expect(CitableSpanId.strip("  #1.2 - A.b()")).toBe("  - A.b()");
  });

  test("strip leaves a line without an id unchanged", () => {
    expect(CitableSpanId.strip("scenario: x")).toBe("scenario: x");
  });

  test("strip removes the id that opens a fire-and-forget marker line", () => {
    expect(CitableSpanId.strip("  #1.4 ~ fire-and-forget")).toBe("  ~ fire-and-forget");
  });

  test.each([
    ["# - A.b()", "a bare hash"],
    ["#1. - A.b()", "a trailing dot"],
    ["#.1 - A.b()", "a leading dot"],
    ["#1..2 - A.b()", "an empty run"],
    ["#1a - A.b()", "a letter in the path"],
    ["#1", "no space after the id (end of line)"],
    ["#1\t- A.b()", "a tab instead of the one space"],
    ["#١ - A.b()", "a non-ASCII digit"],
  ])("%s is not an id (%s)", (line) => {
    expect(CitableSpanId.of(line)).toBeUndefined();
    expect(CitableSpanId.strip(line)).toBe(line);
  });
});

describe("CitableSpanId.isWellFormed — exactly one id", () => {
  test.each(["#1", "#1.3.2", "#10.20"])("%s is well formed", (text) => {
    expect(CitableSpanId.isWellFormed(text)).toBe(true);
  });

  test.each(["", "#", "1.2", "#1.", "#1 ", " #1", "#1.2 x", "#1\n"])("%j is not", (text) => {
    expect(CitableSpanId.isWellFormed(text)).toBe(false);
  });
});

describe("CitableSpanId — the edges mutation testing found unpinned", () => {
  test("inIdOrder compares the last segment as a number: #1.9 before #1.10", () => {
    const node = traceNode(methodSignature("A", "a", []), returned(null), []);
    const ordered = CitableSpanId.inIdOrder([
      { node, id: "#1.10" },
      { node, id: "#1.9" },
    ]);
    expect(ordered.map((cited) => cited.id)).toEqual(["#1.9", "#1.10"]);
  });

  test("a line whose first character is not # carries no id, even when digits follow", () => {
    expect(CitableSpanId.of("x1 - A.b()")).toBeUndefined();
    expect(CitableSpanId.strip("x1 - A.b()")).toBe("x1 - A.b()");
  });

  test("the digit 9 belongs to an id like any other", () => {
    expect(CitableSpanId.of("#9.19 - A.b()")).toBe("#9.19");
    expect(CitableSpanId.isWellFormed("#9")).toBe(true);
  });
});
