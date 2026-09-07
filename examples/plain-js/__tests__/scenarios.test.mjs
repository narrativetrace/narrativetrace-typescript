// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import { createDemoContext, createTracedLendingService, scenarios } from "../src/index.mjs";

/** @typedef {import("@narrativetrace/core-node").TraceTree} TraceTree */

async function runAll() {
  const context = createDemoContext();
  /** @type {string[]} */
  const lines = [];
  /** @type {Map<string, TraceTree>} */
  const captured = new Map();
  for (const scenario of scenarios) {
    lines.push(`=== ${scenario.title} ===`);
    await scenario.run({
      context,
      print: (t) => lines.push(t),
      capture: (k, v) => captured.set(k, v),
    });
    context.reset();
  }
  return { output: lines.join("\n"), captured };
}

test("the registry lists the two library scenarios, each with a wiring note", () => {
  expect(scenarios.map((s) => s.title)).toStrictEqual([
    "Scenario 1: Successful Book Borrow",
    "Scenario 2: Book Unavailable",
  ]);
  for (const scenario of scenarios) expect(scenario.wiring).toContain("Wiring:");
});

test("the successful borrow prints tree, prose and Mermaid with named parameters", async () => {
  const { output, captured } = await runAll();
  const first = output.slice(0, output.indexOf("=== Scenario 2"));
  expect([...first.matchAll(/^--- (.+) ---$/gm)].map((m) => m[1])).toStrictEqual([
    "Trace tree",
    "Prose",
    "Mermaid",
  ]);
  expect(first).toContain(
    'LendingService.borrowBook(memberId: "M-001", isbn: "978-0-13-468599-1")',
  );
  expect(first).toContain(
    'MemberService.lookupMember(memberId: "M-001", cardNumber: "CARD-VERIFY")',
  );
  expect(first).toContain("Received: ");
  expect(captured.get("Scenario 1: Successful Book Borrow")?.roots).toHaveLength(1);
});

test("the unavailable book fails before the member lookup and records the error type", async () => {
  const { output, captured } = await runAll();
  const second = output.slice(output.indexOf("=== Scenario 2"));
  expect([...second.matchAll(/^--- (.+) ---$/gm)].map((m) => m[1])).toStrictEqual([
    "Trace tree",
    "Prose",
  ]);
  expect(second).toContain("BookUnavailableError: Book not available: 978-0-13-235088-4");
  expect(second).not.toContain("MemberService.lookupMember");
  expect(captured.get("Scenario 2: Book Unavailable")?.roots[0]?.outcome.kind).toBe("threw");
});

test("the traced lending service honours an injected clock", () => {
  const context = createDemoContext();
  const lending = createTracedLendingService(context, () => new Date("2026-03-01T12:00:00Z"));
  expect(lending.borrowBook("M-002", "978-0-201-63361-0").dueDate).toBe("2026-03-15");
});
