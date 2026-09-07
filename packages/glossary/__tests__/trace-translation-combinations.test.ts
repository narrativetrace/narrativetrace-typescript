// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  exportJson,
  methodSignature,
  parameterCapture,
  RedactionPolicy,
  returned,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { glossary } from "../src/glossary.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { readTraceExport } from "../src/trace-export-reader.js";
import { renderTranslatedTrace } from "../src/trace-translation-view.js";

const TRANSLATIONS: readonly (readonly [string, string])[] = [
  ["charge", "cobrar"],
  ["payment", "pago"],
  ["customer", "cliente"],
  ["insufficient fund", "fondos insuficientes"],
];

const MODEL = glossary(
  1,
  new Map([
    ["billing", boundedContext("billing", ["packages/billing"])],
    ["shipping", boundedContext("shipping", ["packages/shipping"])],
  ]),
  TRANSLATIONS.map(([term, translation]) =>
    glossaryTerm({
      term,
      context: "billing",
      kind: "noun-phrase",
      status: "curated",
      firstSeen: "2026-08-13",
      translations: new Map([["es", translation]]),
    }),
  ),
);

function translate(json: string, sourcePathOf: (className: string) => string | undefined) {
  return renderTranslatedTrace({
    trace: readTraceExport(json),
    model: MODEL,
    locale: "es",
    sourcePathOf,
  });
}

const inBilling = () => "packages/billing/payment-service.ts";

describe("translation combined with other features", () => {
  test("a redacted value stays redacted in the translated view", () => {
    const exported = exportJson(
      traceTree([
        traceNode(
          methodSignature("PaymentService", "charge", [
            parameterCapture("customerId", "hunter2-secret-token", true),
          ]),
          returned("true"),
          [],
        ),
      ]),
      { scenario: "charge redacts its customer" },
    );

    const { markdown } = translate(exported, inBilling);

    expect(markdown).toContain(`cliente: ${RedactionPolicy.MARKER}`);
    expect(markdown).not.toContain("hunter2-secret-token");
  });

  test("a term translated in one context is untouched in another", () => {
    const exported = exportJson(
      traceTree([traceNode(methodSignature("ParcelService", "charge", []), returned("true"), [])]),
      { scenario: "shipping charges too" },
    );

    const { markdown, gaps } = translate(exported, () => "packages/shipping/parcel-service.ts");

    expect(markdown).toContain("`ParcelService.charge()`");
    expect(gaps).toStrictEqual([
      { context: "shipping", phrase: "charge" },
      { context: "shipping", phrase: "parcel" },
    ]);
  });

  test("a nested failure translates inside the caller that survived it", () => {
    const failure = traceNode(
      methodSignature("PaymentService", "charge", []),
      threw(new RangeError("balance 12.50 below required 74.97")),
      [],
    );
    const exported = exportJson(
      traceTree([
        traceNode(methodSignature("PaymentService", "settle", []), returned("false"), [failure]),
      ]),
      { scenario: "settle survives a failed charge" },
    );

    const { markdown } = translate(exported, inBilling);

    expect(markdown).toContain("- `pago [PaymentService].settle()` → `false`");
    expect(markdown).toContain(
      "  - `pago [PaymentService].cobrar [charge]()` ❌ RangeError: balance 12.50 below required 74.97",
    );
  });

  test("a stored failure that carries no message still renders its type", () => {
    const stored = `{"scenario":{"name":"x"},"events":[
      {"spanId":"1","type":"enter","className":"PaymentService","methodName":"charge"},
      {"spanId":"1","type":"exit","outcome":"threw","errorType":"InsufficientFundsException"}
    ]}`;

    const { markdown } = translate(stored, inBilling);

    expect(markdown).toContain("❌ fondos insuficientes [InsufficientFundsException]: \n");
  });

  test("an untranslated locale still renders every value and structure", () => {
    const exported = exportJson(
      traceTree([
        traceNode(
          methodSignature("PaymentService", "charge", [parameterCapture("amount", "74.97", false)]),
          returned("true"),
          [],
        ),
      ]),
      { scenario: "charge in an unsupported locale" },
    );

    const { markdown } = renderTranslatedTrace({
      trace: readTraceExport(exported),
      model: MODEL,
      locale: "ja",
      sourcePathOf: inBilling,
    });

    expect(markdown).toContain("## Call Flow");
    expect(markdown).toContain("`PaymentService.charge(amount: 74.97)` → `true`");
  });
});
