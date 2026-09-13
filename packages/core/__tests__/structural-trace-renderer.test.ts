// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  concurrencyInfo,
  incomplete,
  methodSignature,
  parameterCapture,
  returned,
  threw,
  traceNode,
  traceTree,
} from "../src/index.js";
import { renderStructural, renderStructuralDocument } from "../src/structural-trace-renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("renderStructural — the AI-safe structural trace artifact (.nt, ADR-002)", () => {
  it("renders no outcome kind for a void call", () => {
    const node = traceNode(
      methodSignature("AuditSink", "record", [parameterCapture("entry", '"e"', false)]),
      returned(null),
      [],
      1,
    );
    expect(renderStructural(traceTree([node]))).toBe("- AuditSink.record(entry)\n");
  });

  it("renders the exception type but never the message", () => {
    const node = traceNode(
      methodSignature("PaymentGateway", "charge", []),
      threw(new Error("card 4111-1111 declined")),
      [],
      1,
    );
    const result = renderStructural(traceTree([node]));
    expect(result).toBe("- PaymentGateway.charge() !! Error\n");
    expect(result).not.toContain("4111");
  });

  it("nests child calls by indentation in capture order", () => {
    const validate = traceNode(
      methodSignature("ExpenseValidator", "ensureValid", [
        parameterCapture("expense", '"e"', false),
      ]),
      returned(null),
      [],
      1,
    );
    const store = traceNode(
      methodSignature("TripLedger", "recordExpense", []),
      returned(null),
      [],
      1,
    );
    const parent = traceNode(
      methodSignature("TripSettlementService", "recordExpense", [
        parameterCapture("tripName", '"Ski"', false),
      ]),
      returned(null),
      [validate, store],
      2,
    );
    expect(renderStructural(traceTree([parent]))).toBe(
      "- TripSettlementService.recordExpense(tripName)\n" +
        "  - ExpenseValidator.ensureValid(expense)\n" +
        "  - TripLedger.recordExpense()\n",
    );
  });

  it("renders an in-flight marker for an incomplete call", () => {
    const node = traceNode(methodSignature("Svc", "hang", []), incomplete(), [], 0);
    expect(renderStructural(traceTree([node]))).toBe("- Svc.hang() ?? incomplete\n");
  });

  it("renders byte-identical output for identical behavior regardless of values and timings", () => {
    const first = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("customerId", '"C-1"', false),
      ]),
      returned('"order-1"'),
      [],
      10,
    );
    const second = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("customerId", '"C-99999"', false),
      ]),
      returned('"order-2"'),
      [],
      999,
    );
    expect(renderStructural(traceTree([first]))).toBe(renderStructural(traceTree([second])));
  });

  it("renders fork members sorted by signature without thread identity", () => {
    const onThreadTwo = concurrencyInfo("fork-1", "pool-1-thread-2", "fork-join");
    const onThreadOne = concurrencyInfo("fork-1", "pool-1-thread-1", "fork-join");
    const stock = traceNode(
      methodSignature("StockService", "check", []),
      returned("true"),
      [],
      5,
      0,
      onThreadTwo,
    );
    const discount = traceNode(
      methodSignature("DiscountEngine", "calculate", []),
      returned("0.15"),
      [],
      9,
      0,
      onThreadOne,
    );
    const parent = traceNode(
      methodSignature("CheckoutService", "quote", []),
      returned('"quote"'),
      [stock, discount], // capture order: nondeterministic across threads
      20,
    );
    const result = renderStructural(traceTree([parent]));
    expect(result).toBe(
      "- CheckoutService.quote() → value\n" +
        "  ~ fork [2]\n" +
        "    - DiscountEngine.calculate() → value\n" +
        "    - StockService.check() → value\n",
    );
    expect(result).not.toContain("pool-1");
  });

  it("renders a fire-and-forget launch as a marker with children, skipping the launcher's own line", () => {
    const info = concurrencyInfo("faf-1", "pool-9", "fire-and-forget");
    const work = traceNode(
      methodSignature("NotificationService", "send", []),
      returned(null),
      [],
      1,
    );
    const launcher = traceNode(
      methodSignature("NotificationService", "launch", []),
      incomplete(),
      [work],
      0,
      0,
      info,
    );
    const parent = traceNode(
      methodSignature("CheckoutService", "complete", []),
      returned(null),
      [launcher],
      2,
    );
    expect(renderStructural(traceTree([parent]))).toBe(
      "- CheckoutService.complete()\n" +
        "  ~ fire-and-forget\n" +
        "    - NotificationService.send()\n",
    );
  });

  it("document form carries only the stable scenario header", () => {
    const node = traceNode(methodSignature("Svc", "run", []), returned(null), [], 1);
    const result = renderStructuralDocument(
      traceTree([node]),
      "Weekend trip settles with three transfers",
    );
    expect(result).toBe(
      "scenario: Weekend trip settles with three transfers\n\n" + "- Svc.run()\n",
    );
  });

  it("renders names and outcome kind without values on a leaf call", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("customerId", '"C-123"', false),
        parameterCapture("quantity", "2", false),
      ]),
      returned('"order-42"'),
      [],
      412,
    );
    const result = renderStructural(traceTree([node]));
    expect(result).toBe("- OrderService.placeOrder(customerId, quantity) → value\n");
    expect(result).not.toContain("C-123");
    expect(result).not.toContain("412");
  });

  it("renders a very deep call tree without a stack overflow", () => {
    let current = traceNode(methodSignature("Recursive", "call1000", []), returned('"ok"'), [], 1);
    for (let i = 0; i < 1000; i++) {
      current = traceNode(
        methodSignature("Recursive", `call${i}`, []),
        returned('"ok"'),
        [current],
        1,
      );
    }
    const result = renderStructural(traceTree([current]));
    expect(result).toContain("Recursive.call0(");
    expect(result).toContain("Recursive.call1000(");
  });

  it("renders a cyclic call tree with a cycle marker and never hangs", () => {
    // `traceNode()` defensively copies `children` at construction (a deliberate, pinned divergence
    // from Java's mutable pass-through — this port is "structurally cycle-incapable by
    // construction"), so a cycle can only be built by hand-assembling the plain object
    // shape directly, bypassing the factory — the same technique
    // `indented-text-renderer.test.ts`/`markdown-renderer.test.ts` use for this exact guard.
    const a = {
      signature: methodSignature("Recursive", "a", []),
      outcome: returned('"ok"'),
      children: [] as unknown[],
      durationMs: 1,
      startTimeMs: 0,
    };
    const b = {
      signature: methodSignature("Recursive", "b", []),
      outcome: returned('"ok"'),
      children: [a] as unknown[],
      durationMs: 1,
      startTimeMs: 0,
    };
    a.children = [b];
    const result = renderStructural(traceTree([a as unknown as ReturnType<typeof traceNode>]));
    expect(result).toContain("Recursive.a(");
    expect(result).toContain("Recursive.b(");
    expect(result).toContain("… (cycle)");
  });
});

// The exception the reference golden's dogfood scenario throws. Named to match, because the
// artifact records the exception's simple type name as structure.
class InvalidExpenseException extends Error {}

describe("renderStructuralDocument — cross-runtime conformance", () => {
  // Golden fixtures from the reference implementation's structural-trace-format.md conformance
  // suite: the same byte-for-byte golden every NarrativeTrace runtime's own `.nt` renderer is
  // pinned against (this repo's `.NET` sibling port pins the identical file). Copied verbatim —
  // never hand-edited — into __tests__/fixtures.
  it("reproduces the reference golden artifact byte for byte", () => {
    const golden = readFileSync(join(__dirname, "fixtures", "java-negative-expense.nt"), "utf-8");

    const call = (
      className: string,
      methodName: string,
      parameters: readonly string[],
      outcome: ReturnType<typeof returned> | ReturnType<typeof threw>,
      children: ReturnType<typeof traceNode>[] = [],
    ) =>
      traceNode(
        methodSignature(
          className,
          methodName,
          parameters.map((name) => parameterCapture(name, '"redacted-by-design"', false)),
        ),
        outcome,
        children,
        7,
      );

    const failure = threw(new InvalidExpenseException("amount -12.00 EUR is not positive"));

    const tree = traceTree([
      call("TripSettlementService", "recordExpense", ["tripName", "expense"], failure, [
        call("ExpenseValidator", "ensureValid", ["expense"], failure),
      ]),
      call(
        "TripSettlementService",
        "settleTrip",
        ["tripName"],
        returned("SettlementPlan[transfers=0]"),
        [
          call("TripLedger", "expensesOf", ["tripName"], returned("[]")),
          call("BalanceCalculator", "computeBalances", ["expenses"], returned("{}")),
          call("SettlementPlanner", "planTransfers", ["balances"], returned("[]")),
        ],
      ),
    ]);

    const rendered = renderStructuralDocument(
      tree,
      "Negative expense is rejected before touching the ledger",
    );

    expect(rendered).toBe(golden);
  });
});
