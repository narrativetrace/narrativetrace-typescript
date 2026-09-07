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

const DINNER_USD = 'Expense(description: "Dinner", amount: 100, currency: "USD")';
const DINNER_EUR = 'Expense(description: "Dinner", amount: 92, currency: "EUR")';
const DINNER_GBP = 'Expense(description: "Dinner", amount: 79, currency: "GBP")';
const DELTA_TO_EUR = '{amount: 100→92, currency: "USD"→"EUR"}';

function object(typeName: string, fields: Record<string, RenderedValue>): RenderedValue {
  return { kind: "object", typeName, fields };
}

function text(value: string): RenderedValue {
  return { kind: "string", value };
}

function num(value: number): RenderedValue {
  return { kind: "number", value };
}

function expense(description: string, amount: number, currency: string): RenderedValue {
  return object("Expense", {
    description: text(description),
    amount: num(amount),
    currency: text(currency),
  });
}

function leaf(className: string, method: string, value: string, structured?: RenderedValue) {
  return traceNode(
    methodSignature(className, method, [parameterCapture("expense", value, false, structured)]),
    returned('"ok"'),
    [],
  );
}

function render(...nodes: ReturnType<typeof traceNode>[]): string {
  return renderMarkdownBody(traceTree(nodes));
}

describe("intra-trace value deltas", () => {
  test("changed scalar fields render as a delta against the reference", () => {
    const result = render(
      leaf("TripLedger", "recordExpense", DINNER_USD, expense("Dinner", 100, "USD")),
      leaf("ShareCalculator", "split", DINNER_EUR, expense("Dinner", 92, "EUR")),
    );

    expect(result).toContain(`recordExpense(expense: ‹Dinner›=${DINNER_USD})`);
    expect(result).toContain(`split(expense: ‹Dinner›′${DELTA_TO_EUR})`);
  });

  test("a repeated changed variant is defined as a delta of the reference", () => {
    const result = render(
      leaf("TripLedger", "recordExpense", DINNER_USD, expense("Dinner", 100, "USD")),
      leaf("ShareCalculator", "split", DINNER_EUR, expense("Dinner", 92, "EUR")),
      leaf("AuditLog", "append", DINNER_EUR, expense("Dinner", 92, "EUR")),
    );

    expect(result).toContain(`split(expense: ‹Dinner·2›=‹Dinner›′${DELTA_TO_EUR})`);
    expect(result).toContain("append(expense: ‹Dinner·2›)");
  });

  test("every later variant diffs against the same reference", () => {
    const result = render(
      leaf("TripLedger", "recordExpense", DINNER_USD, expense("Dinner", 100, "USD")),
      leaf("ShareCalculator", "split", DINNER_EUR, expense("Dinner", 92, "EUR")),
      leaf("Reporter", "report", DINNER_GBP, expense("Dinner", 79, "GBP")),
    );

    expect(result).toContain(`split(expense: ‹Dinner›′${DELTA_TO_EUR})`);
    expect(result).toContain('report(expense: ‹Dinner›′{amount: 100→79, currency: "USD"→"GBP"})');
  });

  test("a delta renders on a return value too", () => {
    const result = render(
      traceNode(
        methodSignature("TripLedger", "recordExpense", []),
        returned(DINNER_USD, expense("Dinner", 100, "USD")),
        [],
      ),
      traceNode(
        methodSignature("ShareCalculator", "normalize", []),
        returned(DINNER_EUR, expense("Dinner", 92, "EUR")),
        [],
      ),
    );

    expect(result).toContain(`\`TripLedger.recordExpense()\` → \`‹Dinner›=${DINNER_USD}\``);
    expect(result).toContain(`\`ShareCalculator.normalize()\` → \`‹Dinner›′${DELTA_TO_EUR}\``);
  });

  test("a changed nested field falls back to the full render", () => {
    const before = 'Trip(name: "Rome week", expenses: [Expense(amount: 10)])';
    const after = 'Trip(name: "Rome week", expenses: [Expense(amount: 20)])';
    const trip = (amount: number): RenderedValue =>
      object("Trip", {
        name: text("Rome week"),
        expenses: { kind: "list", items: [object("Expense", { amount: num(amount) })] },
      });

    const result = render(
      leaf("Planner", "plan", before, trip(10)),
      leaf("Planner", "replan", after, trip(20)),
    );

    expect(result).toContain(`plan(expense: ${before})`);
    expect(result).toContain(`replan(expense: ${after})`);
    expect(result).not.toContain("′");
    expect(result).not.toContain("‹");
  });

  test("an unchanged nested field does not suppress the delta", () => {
    const before = 'Expense(description: "Dinner", amount: 100, split: Share(payer: "Alice"))';
    const after = 'Expense(description: "Dinner", amount: 92, split: Share(payer: "Alice"))';
    const withShare = (amount: number): RenderedValue =>
      object("Expense", {
        description: text("Dinner"),
        amount: num(amount),
        split: object("Share", { payer: text("Alice") }),
      });

    const result = render(
      leaf("TripLedger", "recordExpense", before, withShare(100)),
      leaf("ShareCalculator", "split", after, withShare(92)),
    );

    expect(result).toContain("split(expense: ‹Dinner›′{amount: 100→92})");
  });

  test("a different field set falls back to the full render", () => {
    const before = 'Order(id: "order-77", total: 10, currency: "EUR")';
    const after = 'Order(id: "order-77", total: 10, coupon: "SUMMER")';

    const result = render(
      leaf(
        "Checkout",
        "price",
        before,
        object("Order", { id: text("order-77"), total: num(10), currency: text("EUR") }),
      ),
      leaf(
        "Checkout",
        "apply",
        after,
        object("Order", { id: text("order-77"), total: num(10), coupon: text("SUMMER") }),
      ),
    );

    expect(result).toContain(`price(expense: ${before})`);
    expect(result).not.toContain("′");
    expect(result).not.toContain("‹");
  });

  test("the same identity on a different type is not the same entity", () => {
    const refund = 'Refund(description: "Dinner", amount: 100, currency: "USD")';

    const result = render(
      leaf("TripLedger", "recordExpense", DINNER_USD, expense("Dinner", 100, "USD")),
      leaf(
        "TripLedger",
        "recordRefund",
        refund,
        object("Refund", {
          description: text("Dinner"),
          amount: num(100),
          currency: text("USD"),
        }),
      ),
    );

    expect(result).not.toContain("′");
    expect(result).not.toContain("‹");
  });

  test("a value without an identity field is never a delta", () => {
    const before = 'Expense(amount: 100, currency: "USD", category: "FOOD")';
    const after = 'Expense(amount: 92, currency: "EUR", category: "FOOD")';
    const anon = (amount: number, currency: string): RenderedValue =>
      object("Expense", {
        amount: num(amount),
        currency: text(currency),
        category: text("FOOD"),
      });

    const result = render(
      leaf("TripLedger", "recordExpense", before, anon(100, "USD")),
      leaf("ShareCalculator", "split", after, anon(92, "EUR")),
    );

    expect(result).not.toContain("′");
    expect(result).not.toContain("‹");
  });

  test("a redacted identity field never anchors a delta", () => {
    const before = 'Expense(description: [REDACTED], amount: 100, currency: "USD")';
    const after = 'Expense(description: [REDACTED], amount: 92, currency: "EUR")';

    const result = render(
      leaf("TripLedger", "recordExpense", before, expense("[REDACTED]", 100, "USD")),
      leaf("ShareCalculator", "split", after, expense("[REDACTED]", 92, "EUR")),
    );

    expect(result).not.toContain("′");
    expect(result).not.toContain("‹");
  });

  test("identical structured forms with different bytes fall back to the full render", () => {
    const before = 'Expense(description: "Dinner", amount: 100.00, currency: "USD")';
    const after = 'Expense(description: "Dinner", amount: 100.0, currency: "USD")';
    const same = expense("Dinner", 100, "USD");

    const result = render(
      leaf("TripLedger", "recordExpense", before, same),
      leaf("ShareCalculator", "split", after, same),
    );

    expect(result).toContain(`split(expense: ${after})`);
    expect(result).not.toContain("′");
    expect(result).not.toContain("‹");
  });

  test("values below the reference length never become deltas", () => {
    const result = render(
      leaf("Bank", "charge", 'Fee(name: "Bank", amount: 1)', object("Fee", { name: text("Bank") })),
      leaf("Bank", "refund", 'Fee(name: "Bank", amount: 2)', object("Fee", { name: text("Bank") })),
    );

    expect(result).not.toContain("′");
    expect(result).not.toContain("‹");
  });

  test("a contained reference and its delta share one label", () => {
    const result = render(
      leaf("TripLedger", "recordExpense", DINNER_USD, expense("Dinner", 100, "USD")),
      traceNode(methodSignature("TripLedger", "expensesOf", []), returned(`[${DINNER_USD}]`), []),
      leaf("ShareCalculator", "split", DINNER_EUR, expense("Dinner", 92, "EUR")),
    );

    expect(result).toContain(`recordExpense(expense: ‹Dinner›=${DINNER_USD})`);
    expect(result).toContain("`TripLedger.expensesOf()` → `[‹Dinner›]`");
    expect(result).toContain(`split(expense: ‹Dinner›′${DELTA_TO_EUR})`);
  });

  test("every scalar kind formats the way the flat renderer prints it", () => {
    const before = 'Order(id: "order-77", count: 1, active: true, note: null)';
    const after = 'Order(id: "order-77", count: 2, active: false, note: "rush")';
    const order = (count: number, active: boolean, note: RenderedValue): RenderedValue =>
      object("Order", {
        id: text("order-77"),
        count: num(count),
        active: { kind: "boolean", value: active },
        note,
      });

    const result = render(
      leaf("Warehouse", "receive", before, order(1, true, { kind: "other", text: "null" })),
      leaf("Warehouse", "ship", after, order(2, false, text("rush"))),
    );

    expect(result).toContain(
      'ship(expense: ‹order-77›′{count: 1→2, active: true→false, note: null→"rush"})',
    );
  });
});
