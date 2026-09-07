// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { expect, test } from "vitest";
import { createDemoContext } from "../src/scenario.js";
import { scenarios } from "../src/scenarios.js";

test("the registry lists Java's six ecommerce scenarios, in order, each with a wiring note", () => {
  expect(scenarios.map((s) => s.title)).toStrictEqual([
    "Scenario 1: Successful Order + Async Notification",
    "Scenario 2: Payment Failure — Inventory Leak Bug",
    "Scenario 3: Flaky External Service",
    "Scenario 4: Unknown Customer",
    "Scenario 5: Out of Stock",
    "Scenario 6: Explicit Async Trace Capture",
  ]);
  for (const scenario of scenarios) expect(scenario.wiring.trim()).not.toBe("");
});

type Run = { readonly output: string; readonly captured: Map<string, TraceTree> };

async function runScenario(index: number): Promise<Run> {
  const scenario = scenarios[index];
  if (scenario === undefined) throw new Error(`no scenario ${index}`);
  const lines: string[] = [];
  const captured = new Map<string, TraceTree>();
  await scenario.run({
    context: createDemoContext(),
    print: (text) => lines.push(text),
    capture: (title, tree) => captured.set(title, tree),
  });
  return { output: lines.join("\n"), captured };
}

function sectionsOf(output: string): string[] {
  return [...output.matchAll(/^--- (.+) ---$/gm)].map((m) => m[1] ?? "");
}

test("scenario 1 places the order, awaits the notification, and prints tree, prose and Mermaid", async () => {
  const { output, captured } = await runScenario(0);
  expect(sectionsOf(output)).toStrictEqual(["Trace tree", "Prose", "Mermaid"]);
  expect(output).toContain("cardToken: [REDACTED]");
  expect(output).toContain("sequenceDiagram");
  const tree = captured.get("Scenario 1: Successful Order + Async Notification");
  expect(tree?.roots.map((r) => r.signature.className)).toStrictEqual([
    "OrderService",
    "NotificationService",
  ]);
});

test("scenario 2 shows the reservation without a release and names the leak", async () => {
  const { output, captured } = await runScenario(1);
  expect(sectionsOf(output)).toStrictEqual(["Trace tree", "Prose", "Mermaid"]);
  expect(output).toContain('InventoryService.reserve(productId: "P2", quantity: 3)');
  expect(output).not.toContain("InventoryService.release(");
  expect(output).toContain(
    "^ Notice: InventoryService.reserve was called but InventoryService.release is missing",
  );
  const root = captured.get("Scenario 2: Payment Failure — Inventory Leak Bug")?.roots[0];
  expect(root?.outcome.kind).toBe("threw");
});

test("scenario 3 records one success and one ExternalServiceError from the same proxy", async () => {
  const { output, captured } = await runScenario(2);
  expect(sectionsOf(output)).toStrictEqual(["Trace tree", "Prose"]);
  const roots = captured.get("Scenario 3: Flaky External Service")?.roots ?? [];
  expect(roots.map((r) => r.outcome.kind)).toStrictEqual(["returned", "threw"]);
  expect(output).toContain(
    "ExternalServiceError: External notification service unavailable (call #2)",
  );
  expect(output).not.toContain("arg0");
});

test("scenario 4 stops at the customer lookup with the @onError narration", async () => {
  const { output, captured } = await runScenario(3);
  expect(sectionsOf(output)).toStrictEqual(["Trace tree", "Prose"]);
  expect(output).toContain("Customer C-UNKNOWN not found");
  const root = captured.get("Scenario 4: Unknown Customer")?.roots[0];
  expect(root?.children.map((c) => c.signature.methodName)).toStrictEqual(["findCustomer"]);
});

test("scenario 5 adds the PlantUML view of the out-of-stock failure", async () => {
  const { output } = await runScenario(4);
  expect(sectionsOf(output)).toStrictEqual(["Trace tree", "Prose", "PlantUML"]);
  expect(output).toContain("Insufficient stock for P3, requested 9999");
  expect(output).toContain("@startuml");
});

test("scenario 6 joins two concurrent remote lookups into one fork/join segment", async () => {
  const { output, captured } = await runScenario(5);
  expect(sectionsOf(output)).toStrictEqual(["Trace tree"]);
  expect(output).toContain("⑂ fork [2 tasks]");
  expect(output).not.toContain("awaited sequentially");
  const tree = captured.get("Scenario 6: Explicit Async Trace Capture");
  const forked = tree?.roots
    .flatMap((r) => r.children)
    .filter((n) => n.concurrency?.kind === "fork-join");
  expect(forked?.map((n) => n.signature.className)).toStrictEqual([
    "RemoteCatalogService",
    "RemoteCatalogService",
  ]);
});

test("createDemoContext streams every event to the live listener and reset() isolates scenarios", async () => {
  const seen: string[] = [];
  const context = createDemoContext((event) => seen.push(event.type));
  const captured = new Map<string, TraceTree>();
  const ctx = {
    context,
    print: () => undefined,
    capture: (t: string, tree: TraceTree) => captured.set(t, tree),
  };
  for (const scenario of scenarios) {
    await scenario.run(ctx);
    context.reset();
  }
  expect(seen.filter((t) => t === "enter").length).toBe(seen.filter((t) => t === "exit").length);
  expect(seen).toContain("fork-created");
  expect(captured.size).toBe(scenarios.length);
  expect(captured.get("Scenario 4: Unknown Customer")?.roots).toHaveLength(1);
});
