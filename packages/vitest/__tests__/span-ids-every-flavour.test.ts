// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AsyncNarrativeContext,
  NarrativeTraceConfig,
  renderIndentedText,
  renderProse,
  renderStructuralDocument,
  type TraceTree,
} from "@narrativetrace/core-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeTraceOutput } from "../src/index.js";

// Parity check C6 (2026-10-11): every output flavour this runtime ships names the same spans. The
// checkout flow: place an order, which reserves inventory, charges payment and saves the order.
const CITABLE_IDS = ["#1", "#1.1", "#1.2", "#1.3"];

function checkoutTrace(): TraceTree {
  const context = new AsyncNarrativeContext(new NarrativeTraceConfig());
  context.enterMethod("OrderService", "placeOrder", []);
  for (const method of ["reserveInventory", "chargePayment", "saveOrder"]) {
    context.enterMethod("Checkout", method, []);
    context.exitMethodWithReturn('"ok"');
  }
  context.exitMethodWithReturn('"OK"');
  return context.captureTrace();
}

describe("span ids appear in every output flavour", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "parity-c6-"));
  });

  afterEach(() => rmSync(outputDir, { recursive: true, force: true }));

  function writtenFile(
    format: "md" | "mmd" | "puml" | "json" | "canonical-json",
    tree: TraceTree = checkoutTrace(),
  ): string {
    const artifacts = writeTraceOutput(tree, {
      outputDir,
      moduleName: "checkout",
      testName: "places an order",
      formats: [format],
    });
    const [relative] = [...artifacts.values()];
    return readFileSync(join(outputDir, relative as string), "utf-8");
  }

  const CITABLE_FLAVOURS: Record<string, () => string> = {
    "indented text": () => renderIndentedText(checkoutTrace()),
    prose: () => renderProse(checkoutTrace()),
    "structural .nt": () => renderStructuralDocument(checkoutTrace(), "places an order"),
    "Markdown file": () => writtenFile("md"),
    "Mermaid diagram file": () => writtenFile("mmd"),
    "PlantUML diagram file": () => writtenFile("puml"),
  };

  for (const [flavour, render] of Object.entries(CITABLE_FLAVOURS)) {
    test(`${flavour} cites the root and each child by its position id`, () => {
      const output = render();

      for (const id of CITABLE_IDS)
        expect(output).toMatch(new RegExp(`${id.replace(".", "\\.")}(?![.\\d])`));
    });
  }

  test("the JSON and canonical JSON files carry the W3C span id of every call", () => {
    const tree = checkoutTrace();
    const spanIds = [tree.roots[0], ...(tree.roots[0]?.children ?? [])].map(
      (node) => node?.spanContext?.spanId,
    );

    expect(spanIds).toHaveLength(4);
    for (const flavour of ["json", "canonical-json"] as const) {
      const output = writtenFile(flavour, tree);
      for (const spanId of spanIds) expect(output).toContain(spanId);
    }
  });
});
