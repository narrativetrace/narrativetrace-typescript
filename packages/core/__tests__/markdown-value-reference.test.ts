// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { renderMarkdownBody } from "../src/markdown-renderer.js";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";
import type { RenderedValue } from "../src/rendered-value.js";
import { traceNode } from "../src/trace-node.js";
import { returned } from "../src/trace-outcome.js";
import { traceTree } from "../src/trace-tree.js";

const HOTEL = 'Expense(description: "Hotel", amount: 400.00, currency: "EUR")';

function object(typeName: string, fields: Record<string, RenderedValue>): RenderedValue {
  return { kind: "object", typeName, fields };
}

function text(value: string): RenderedValue {
  return { kind: "string", value };
}

function leaf(
  className: string,
  method: string,
  value: string,
  structured?: RenderedValue,
): ReturnType<typeof traceNode> {
  return traceNode(
    methodSignature(className, method, [parameterCapture("expense", value, false, structured)]),
    returned('"ok"'),
    [],
  );
}

describe("content-addressed value references", () => {
  test("a repeated long value defines a reference once and reuses it", () => {
    const tree = traceTree([
      leaf("ExpenseValidator", "ensureValid", HOTEL),
      leaf("TripLedger", "recordExpense", HOTEL),
    ]);

    const result = renderMarkdownBody(tree);

    expect(result).toContain(`ensureValid(expense: ‹v1›=${HOTEL})`);
    expect(result).toContain("recordExpense(expense: ‹v1›)");
  });

  test("the label comes from the identity field of the structured value", () => {
    const structured = object("Expense", { description: text("Hotel") });
    const tree = traceTree([
      leaf("ExpenseValidator", "ensureValid", HOTEL, structured),
      leaf("TripLedger", "recordExpense", HOTEL, structured),
    ]);

    const result = renderMarkdownBody(tree);

    expect(result).toContain(`ensureValid(expense: ‹Hotel›=${HOTEL})`);
    expect(result).toContain("recordExpense(expense: ‹Hotel›)");
  });

  test("short repeated values are never referenced", () => {
    const tree = traceTree([leaf("A", "m", '"short"'), leaf("B", "n", '"short"')]);

    expect(renderMarkdownBody(tree)).not.toContain("‹");
  });

  test("colliding identity labels are disambiguated with ordinals", () => {
    const meal = 'Expense(description: "Meal", amount: 10.00, currency: "EUR")';
    const trip = 'Expense(description: "Meal", amount: 20.00, currency: "USD")';
    const tree = traceTree([
      leaf("A", "one", meal, object("Expense", { description: text("Meal") })),
      leaf("B", "two", meal, object("Expense", { description: text("Meal") })),
      leaf("C", "three", trip, object("Trip", { description: text("Meal") })),
      leaf("D", "four", trip, object("Trip", { description: text("Meal") })),
    ]);

    const result = renderMarkdownBody(tree);

    expect(result).toContain("‹Meal›=");
    expect(result).toContain("‹Meal·2›=");
  });

  test("an identity label longer than twenty-four characters is elided", () => {
    const long = "a description that is far longer than the label cap allows";
    const value = `Expense(description: "${long}", amount: 1.00)`;
    const structured = object("Expense", { description: text(long) });
    const tree = traceTree([
      leaf("A", "one", value, structured),
      leaf("B", "two", value, structured),
    ]);

    expect(renderMarkdownBody(tree)).toContain(`‹${long.slice(0, 24)}…›=`);
  });

  test("a label exactly at the cap length is not elided", () => {
    const exact = "x".repeat(24);
    const value = `Expense(description: "${exact}", amount: 1.00, currency: "EUR")`;
    const structured = object("Expense", { description: text(exact) });
    const tree = traceTree([
      leaf("A", "one", value, structured),
      leaf("B", "two", value, structured),
    ]);

    expect(renderMarkdownBody(tree)).toContain(`‹${exact}›=`);
  });

  test("a redacted identity field is skipped for the next candidate", () => {
    const structured = object("Expense", {
      description: text("[REDACTED]"),
      title: text("Hotel"),
    });
    const tree = traceTree([
      leaf("A", "one", HOTEL, structured),
      leaf("B", "two", HOTEL, structured),
    ]);

    const result = renderMarkdownBody(tree);

    expect(result).toContain("‹Hotel›=");
    expect(result).not.toContain("‹[REDACTED]›");
  });

  test("an object without a usable identity field falls back to its type name", () => {
    const structured = object("Expense", { amount: { kind: "number", value: 400 } });
    const tree = traceTree([
      leaf("A", "one", HOTEL, structured),
      leaf("B", "two", HOTEL, structured),
    ]);

    expect(renderMarkdownBody(tree)).toContain("‹Expense›=");
  });

  test("control characters in an identity value are sanitized in the label", () => {
    const structured = object("Expense", { description: text("Ho\ntel") });
    const tree = traceTree([
      leaf("A", "one", HOTEL, structured),
      leaf("B", "two", HOTEL, structured),
    ]);

    const result = renderMarkdownBody(tree);

    expect(result).toContain("‹Ho\\ntel›=");
    expect(result).not.toContain("‹Ho\ntel›");
  });

  test("a referenced value is replaced inside container values", () => {
    const listRender = `[${HOTEL}]`;
    const tree = traceTree([
      leaf("ExpenseValidator", "ensureValid", HOTEL),
      leaf("TripLedger", "recordExpense", HOTEL),
      traceNode(methodSignature("TripLedger", "expensesOf", []), returned(listRender), []),
    ]);

    expect(renderMarkdownBody(tree)).toContain("`TripLedger.expensesOf()` → `[‹v1›]`");
  });

  test("containment inside another captured value counts toward a reference", () => {
    const listRender = `[${HOTEL}]`;
    const tree = traceTree([
      leaf("ExpenseValidator", "ensureValid", HOTEL),
      traceNode(methodSignature("TripLedger", "expensesOf", []), returned(listRender), []),
    ]);

    const result = renderMarkdownBody(tree);

    expect(result).toContain(`ensureValid(expense: ‹v1›=${HOTEL})`);
    expect(result).toContain("`TripLedger.expensesOf()` → `[‹v1›]`");
  });

  test("a value exactly at the minimum reference length is referenced", () => {
    const exact = "y".repeat(40);
    const tree = traceTree([leaf("A", "one", exact), leaf("B", "two", exact)]);

    expect(renderMarkdownBody(tree)).toContain(`one(expense: ‹v1›=${exact})`);
  });

  test("a value one character below the minimum is never referenced", () => {
    const short = "y".repeat(39);
    const tree = traceTree([leaf("A", "one", short), leaf("B", "two", short)]);

    expect(renderMarkdownBody(tree)).not.toContain("‹");
  });

  test("a redacted parameter never enters the index or shows its captured value", () => {
    const secret = 'Card(number: "4111111111111111", holder: "Alice Smith")';
    const sig = methodSignature("Payments", "charge", [parameterCapture("card", secret, true)]);
    const tree = traceTree([
      traceNode(sig, returned('"ok"'), []),
      traceNode(sig, returned('"ok"'), []),
    ]);

    const result = renderMarkdownBody(tree);

    expect(result).toContain("card: [REDACTED]");
    expect(result).not.toContain("4111111111111111");
    expect(result).not.toContain("‹");
  });

  test("a parent inline return defines the reference and a child return reuses it", () => {
    const child = traceNode(methodSignature("Ledger", "load", []), returned(HOTEL), []);
    const parent = traceNode(methodSignature("Trip", "settle", []), returned(HOTEL), [child]);

    const result = renderMarkdownBody(traceTree([parent]));

    expect(result).toContain(`\`Trip.settle()\` → \`‹v1›=${HOTEL}\``);
    expect(result).toContain("`Ledger.load()` → `‹v1›`");
  });
});
