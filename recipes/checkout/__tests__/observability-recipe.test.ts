// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TracingLevel } from "@narrativetrace/core-node";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contextLoggingAndExporting } from "../support/observed-context.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/send-traces-to-the-observability-stack-you-already-run.md: ONE run of
 * the checkout writes the log lines it always wrote AND an OpenTelemetry span per traced call, with
 * the parentage and the attributes the page shows — and without the redacted values (release rule
 * 8, docs as tests).
 *
 * @llmNote The exported spans are written out by `dumpOf`, naming and sorting everything it prints,
 * so one run's dump is byte-identical to the next — a raw span dump carries timestamps and OTel's
 * own generated ids and could never be embedded. The provider is built here and never registered
 * globally: a global provider would leak from this test into the next.
 */
const SLUG = "send-traces-to-the-observability-stack-you-already-run";
const CARD_NUMBER = "4242424242424242";

let spans: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  useStableSpanIds();
  spans = new InMemorySpanExporter();
  provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
});

afterEach(async () => {
  await provider.shutdown();
});

describe("send traces to the observability stack you already run", () => {
  it("one run narrates and exports", () => {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, "checkout.log"),
      provider.getTracer("narrativetrace"),
    );
    const { checkout } = tracedCheckout(context);

    const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);

    expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
    assertOneSpanPerTracedCall();
    assertNoRedactedValueWasExported();
    mkdirSync(recipeOutput(SLUG), { recursive: true });
    writeFileSync(join(recipeOutput(SLUG), "exported-spans.txt"), dumpOf(spans.getFinishedSpans()));
  });

  it("a run that throws exports the failed span with its error status", () => {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, "declined.log"),
      provider.getTracer("narrativetrace"),
    );
    const { checkout } = tracedCheckout(context);

    expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, "4000000000000002")).toThrow();

    const failed = spans.getFinishedSpans().find((span) => span.name === "PaymentService.charge");
    expect(failed?.status.code).toBe(2);
    expect(failed?.events.map((event) => event.name)).toContain("exception");
  });
});

describe("send traces to the observability stack you already run, at other levels", () => {
  function runAt(level: TracingLevel): void {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, `${level}.log`),
      provider.getTracer("narrativetrace"),
      level,
    );
    tracedCheckout(context).checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);
  }

  it("summary exports the same spans without the parameter attributes", () => {
    runAt("summary");

    const exported = spans.getFinishedSpans();
    expect(exported).toHaveLength(4);
    const keys = exported.flatMap((span) => Object.keys(span.attributes));
    expect(keys.filter((key) => key.startsWith("narrative.param."))).toEqual([]);
  });

  it("off creates no event and therefore no span", () => {
    runAt("off");

    expect(spans.getFinishedSpans()).toEqual([]);
  });
});

/** Four traced calls, four spans, ended innermost first — and the tree is reconstructed. */
function assertOneSpanPerTracedCall(): void {
  const exported = spans.getFinishedSpans();
  expect(exported.map((span) => span.name)).toEqual([
    "InventoryService.reserve",
    "PaymentService.charge",
    "OrderRepository.save",
    "OrderService.placeOrder",
  ]);
  const root = named(exported, "OrderService.placeOrder");
  expect(parentNameOf(exported, named(exported, "PaymentService.charge"))).toBe(root.name);
  expect(parentNameOf(exported, root)).toBeUndefined();
  expect(new Set(exported.map((span) => span.spanContext().traceId)).size).toBe(1);
  expect(root.spanContext().traceId).not.toBe(root.attributes["nt.trace_id"]);
}

/** What the deny-list caught never reaches the exporter either — there is no attribute for it. */
function assertNoRedactedValueWasExported(): void {
  const attributes = spans.getFinishedSpans().flatMap((span) => Object.entries(span.attributes));
  const keys = attributes.map(([key]) => key);
  expect(keys).not.toContain("narrative.param.cardNumber");
  expect(keys).not.toContain("narrative.param.card");
  expect(attributes.map(([, value]) => String(value)).join("\n")).not.toContain(CARD_NUMBER);
}

function named(exported: readonly ReadableSpan[], name: string): ReadableSpan {
  const found = exported.find((span) => span.name === name);
  if (found === undefined) throw new Error(`no span named ${name}`);
  return found;
}

function parentNameOf(exported: readonly ReadableSpan[], span: ReadableSpan): string | undefined {
  return exported.find((other) => other.spanContext().spanId === span.parentSpanId)?.name;
}

/** The dump the page embeds: span name, parent, and every attribute, sorted by key. */
function dumpOf(exported: readonly ReadableSpan[]): string {
  return exported
    .map((span) => {
      const attributes = Object.entries(span.attributes)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, value]) => `    ${key}: ${value}`);
      const parent = parentNameOf(exported, span) ?? "(none — this is the root)";
      return [`span: ${span.name}`, `  parent: ${parent}`, ...attributes].join("\n");
    })
    .join("\n")
    .concat("\n");
}
