// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { glossary } from "../src/glossary.js";
import { type GlossaryTermInput, glossaryTerm } from "../src/glossary-term.js";
import type { TranslatableCall, TranslatableTrace } from "../src/trace-export-reader.js";
import { renderTranslatedTrace } from "../src/trace-translation-view.js";

function term(text: string, translation: string, overrides: Partial<GlossaryTermInput> = {}) {
  return glossaryTerm({
    term: text,
    context: "billing",
    kind: "noun-phrase",
    status: "curated",
    firstSeen: "2026-08-13",
    translations: new Map([["es", translation]]),
    ...overrides,
  });
}

function modelOf(...terms: ReturnType<typeof term>[]) {
  return glossary(
    1,
    new Map([["billing", boundedContext("billing", ["packages/billing"])]]),
    terms,
  );
}

function call(overrides: Partial<TranslatableCall> = {}): TranslatableCall {
  return {
    className: "PaymentService",
    methodName: "charge",
    parameters: [],
    outcome: "returned",
    children: [],
    ...overrides,
  };
}

function traceOf(...calls: TranslatableCall[]): TranslatableTrace {
  return { scenario: "charge fails when funds are insufficient", calls };
}

/** The call-flow section alone, so structural assertions ignore the document scaffolding. */
function flowOf(markdown: string): string {
  const lines = markdown.split("\n");
  const start = lines.indexOf("## Flujo de llamadas") + 2;
  const end = lines.indexOf("## Vacíos del glosario");
  return lines.slice(start, end === -1 ? undefined : end - 1).join("\n");
}

function render(model: ReturnType<typeof modelOf>, trace: TranslatableTrace) {
  return renderTranslatedTrace({
    trace,
    model,
    locale: "es",
    sourcePathOf: () => "packages/billing/payment-service.ts",
  });
}

describe("renderTranslatedTrace", () => {
  test("glosses a call's identifiers and keeps the originals beside them", () => {
    const model = modelOf(term("payment", "pago", { kind: "word" }), term("charge", "cobrar"));

    expect(render(model, traceOf(call())).markdown).toContain(
      "- `pago [PaymentService].cobrar [charge]()`",
    );
  });

  test("translates parameter names and carries their values through byte for byte", () => {
    const model = modelOf(
      term("customer", "cliente", { kind: "word" }),
      term("amount", "importe", { kind: "word" }),
    );
    const charged = call({
      parameters: [
        { name: "customerId", value: '"C-BROKE"' },
        { name: "amount", value: "74.97" },
      ],
    });

    expect(render(model, traceOf(charged)).markdown).toContain(
      '(cliente: "C-BROKE", importe: 74.97)',
    );
  });

  test("shows a returned value exactly as the run rendered it", () => {
    const charged = call({ outcome: "returned", returnValue: "74.97" });

    expect(render(modelOf(), traceOf(charged)).markdown).toContain("` → `74.97`");
  });

  test("shows nothing after a call that returned no value", () => {
    const charged = call({ outcome: "returned", returnValue: null });

    expect(flowOf(render(modelOf(), traceOf(charged)).markdown)).toBe(
      "- `PaymentService.charge()`",
    );
  });

  test("glosses a thrown error's type and leaves its message verbatim", () => {
    const model = modelOf(term("insufficient fund", "fondos insuficientes"));
    const charged = call({
      outcome: "threw",
      errorType: "InsufficientFundsException",
      errorMessage: "balance 12.50 below required 74.97",
    });

    expect(render(model, traceOf(charged)).markdown).toContain(
      "❌ fondos insuficientes [InsufficientFundsException]: balance 12.50 below required 74.97",
    );
  });

  test("names an untranslated error by its own type alone", () => {
    const charged = call({
      outcome: "threw",
      errorType: "InsufficientFundsException",
      errorMessage: "balance 12.50 below required 74.97",
    });

    expect(render(modelOf(), traceOf(charged)).markdown).toContain(
      "❌ InsufficientFundsException: balance 12.50 below required 74.97",
    );
  });

  test("reports a call that never completed in the reader's language", () => {
    const charged = call({ outcome: "incomplete" });

    expect(render(modelOf(), traceOf(charged)).markdown).toContain("⏳ (incompleto)");
  });

  test("indents a call under the caller that made it", () => {
    const debit = call({ className: "LedgerService", methodName: "debit" });
    const charged = call({ children: [debit, call({ methodName: "settle" })] });

    expect(flowOf(render(modelOf(), traceOf(charged)).markdown)).toBe(
      [
        "- `PaymentService.charge()`",
        "  - `LedgerService.debit()`",
        "  - `PaymentService.settle()`",
      ].join("\n"),
    );
  });

  test("keeps a parameter's own name when the glossary has no word for it", () => {
    const charged = call({ parameters: [{ name: "customerId", value: '"C-BROKE"' }] });

    expect(render(modelOf(), traceOf(charged)).markdown).toContain('(customerId: "C-BROKE")');
  });

  test("leaves an identifier that normalizes to nothing exactly as it was", () => {
    const model = modelOf(term("payment", "pago", { kind: "word" }));
    const bare = call({
      className: "Service",
      methodName: "charge",
      parameters: [{ name: "id", value: "7" }],
      outcome: "threw",
      errorType: "Exception",
      errorMessage: "boom",
    });

    const { markdown, gaps } = render(model, traceOf(bare));

    expect(flowOf(markdown)).toBe("- `Service.charge(id: 7)` ❌ Exception: boom");
    expect(gaps.map((gap) => gap.phrase)).toStrictEqual(["charge"]);
  });

  test("reports a failure that carried no error type by its message alone", () => {
    const charged = call({ outcome: "threw", errorMessage: "not an Error instance" });

    expect(flowOf(render(modelOf(), traceOf(charged)).markdown)).toBe(
      "- `PaymentService.charge()` ❌ not an Error instance",
    );
  });

  test("shows nothing after a call whose return value was undefined", () => {
    const charged = call({ outcome: "returned", returnValue: "undefined" });

    expect(flowOf(render(modelOf(), traceOf(charged)).markdown)).toBe(
      "- `PaymentService.charge()`",
    );
  });

  test("ends the document after the call flow when nothing is missing", () => {
    const model = modelOf(term("payment", "pago", { kind: "word" }), term("charge", "cobrar"));

    expect(render(model, traceOf(call())).markdown).toBe(
      [
        "**Escenario:** charge fails when funds are insufficient",
        "",
        "## Flujo de llamadas",
        "",
        "- `pago [PaymentService].cobrar [charge]()`",
        "",
      ].join("\n"),
    );
  });

  test("assembles a document of the scenario, the call flow, and the gaps it left", () => {
    const model = modelOf(term("charge", "cobrar"));
    const charged = call({
      outcome: "threw",
      errorType: "InsufficientFundsException",
      errorMessage: "balance 12.50 below required 74.97",
    });

    const { markdown, gaps } = render(model, traceOf(charged));

    expect(markdown).toBe(
      [
        "**Escenario:** charge fails when funds are insufficient",
        "",
        "## Flujo de llamadas",
        "",
        "- `PaymentService.cobrar [charge]()` \u274c InsufficientFundsException: balance 12.50 below required 74.97",
        "",
        "## Vacíos del glosario",
        "",
        "- billing: `insufficient fund`",
        "- billing: `payment`",
        "",
      ].join("\n"),
    );
    expect(gaps).toStrictEqual([
      { context: "billing", phrase: "insufficient fund" },
      { context: "billing", phrase: "payment" },
    ]);
  });

  test("reports each missing phrase once, however often the trace uses it", () => {
    const charged = call({ children: [call(), call()] });

    expect(render(modelOf(), traceOf(charged)).gaps).toStrictEqual([
      { context: "billing", phrase: "charge" },
      { context: "billing", phrase: "payment" },
    ]);
  });

  test("leaves out the gaps section when the glossary translated everything", () => {
    const model = modelOf(term("payment", "pago", { kind: "word" }), term("charge", "cobrar"));

    const { markdown, gaps } = render(model, traceOf(call()));

    expect(gaps).toStrictEqual([]);
    expect(markdown).not.toContain("Vacíos del glosario");
  });
});

// A hand-built or deserialized trace can hold an ancestor — nothing at the type level prevents it.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded call-tree walk (cyclic and very deep trees)", () => {
  function cyclicCall(): TranslatableCall {
    const self = call();
    (self as { children: TranslatableCall[] }).children = [self];
    return self;
  }

  function deepChain(length: number): TranslatableCall {
    let node = call({ className: "Leaf" });
    for (let i = 0; i < length; i++) {
      node = call({ className: "Svc", children: [node] });
    }
    return node;
  }

  test("does not crash on a cyclic trace, and marks the cycle instead of looping forever", () => {
    const { markdown } = render(modelOf(), traceOf(cyclicCall()));
    expect(markdown).toContain("… (cycle)");
  });

  test("does not stack-overflow on a very deep chain, and marks the depth limit", () => {
    const { markdown } = render(modelOf(), traceOf(deepChain(50_000)));
    expect(markdown).toContain("… (depth limit)");
  });
});
