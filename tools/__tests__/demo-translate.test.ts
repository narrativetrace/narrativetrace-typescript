// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { EXAMPLE_NAMES, type ExampleTree, loadExample } from "../demo-registry.js";
import { type CapturedTrace, glossaryLocales, translateCaptured } from "../demo-translate.js";

const glossaryOf = (name: string): string =>
  readFileSync(`examples/${name}/glossary.json`, "utf-8");

function glossaryWith(translations: Record<string, string>): string {
  return JSON.stringify({
    schemaVersion: 1,
    contexts: { shop: { packages: ["x"], description: "d" } },
    terms: [
      {
        term: "order",
        context: "shop",
        kind: "word",
        status: "curated",
        translations,
        sources: [],
        firstSeen: "2026-08-27",
      },
    ],
  });
}

async function captureEcommerce(index: number): Promise<CapturedTrace[]> {
  const example = await loadExample("ecommerce");
  const context = example.createDemoContext(null);
  const captured: CapturedTrace[] = [];
  const scenario = example.scenarios[index];
  if (scenario === undefined) throw new Error(`no scenario ${index}`);
  await scenario.run({
    context,
    print: () => undefined,
    capture: (title: string, tree: ExampleTree) => captured.push({ title, tree }),
  });
  return captured;
}

describe("glossaryLocales", () => {
  test("every committed example glossary loads in the strict reader and offers es and zh-CN", () => {
    for (const name of EXAMPLE_NAMES) {
      expect(glossaryLocales(glossaryOf(name)), name).toStrictEqual(["en", "es", "zh-CN"]);
    }
  });

  test("offers only locales that both the glossary and the scaffolding bundle carry", () => {
    expect(glossaryLocales(glossaryWith({}))).toStrictEqual(["en"]);
    expect(glossaryLocales(glossaryWith({ ja: "注文" }))).toStrictEqual(["en"]);
    expect(glossaryLocales(glossaryWith({ "zh-CN": "订单", es: "pedido" }))).toStrictEqual([
      "en",
      "es",
      "zh-CN",
    ]);
  });

  test("a malformed glossary fails loudly rather than degrading to English", () => {
    expect(() => glossaryLocales("{")).toThrow();
    expect(() =>
      glossaryLocales('{"schemaVersion":1,"contexts":{},"terms":[{"term":"x"}]}'),
    ).toThrow();
  });
});

describe("translateCaptured", () => {
  test("re-derives a captured ecommerce trace in Spanish, keeping originals and values", async () => {
    const captured = await captureEcommerce(3);
    const [file] = translateCaptured(
      glossaryOf("ecommerce"),
      "examples/ecommerce/src",
      "es",
      captured,
    );
    expect(file?.locale).toBe("es");
    expect(file?.path).toBe("Scenario 4: Unknown Customer");
    expect(file?.markdown).toContain("Escenario");
    expect(file?.markdown).toContain("buscar cliente [findCustomer]");
    expect(file?.markdown).toContain('"C-UNKNOWN"');
    expect(file?.markdown).toContain("Customer not found: C-UNKNOWN");
  });

  test("Simplified Chinese uses the zh-CN bundle's headings and the glossary's words", async () => {
    const captured = await captureEcommerce(3);
    const [file] = translateCaptured(
      glossaryOf("ecommerce"),
      "examples/ecommerce/src",
      "zh-CN",
      captured,
    );
    expect(file?.markdown).toContain("场景");
    expect(file?.markdown).toContain("查找顾客 [findCustomer]");
  });

  test("a phrase the glossary cannot say lands in the gaps footer, the line stays in English", async () => {
    const captured = await captureEcommerce(3);
    const [file] = translateCaptured(glossaryWith({ es: "pedido" }), "x", "es", captured);
    expect(file?.gaps).toContainEqual({ context: "shop", phrase: "find customer" });
    expect(file?.markdown).toContain("Vacíos del glosario");
    expect(file?.markdown).toContain("`pedido [OrderService].placeOrder(");
    expect(file?.gaps).toContainEqual({ context: "shop", phrase: "place order" });
    expect(file?.markdown).not.toContain("buscar cliente");
  });

  test("no captured scenarios translate to no files", () => {
    expect(
      translateCaptured(glossaryOf("clarity"), "examples/clarity/src", "es", []),
    ).toStrictEqual([]);
  });
});
