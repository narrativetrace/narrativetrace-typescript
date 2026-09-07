// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core";
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { expect, test } from "vitest";
import { createTracedOrderService, createTracedServices } from "../src/traced-services.js";

test("createTracedOrderService returns context and service", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  expect(narrativeContext).toBeDefined();
  expect(orderService).toBeDefined();
  expect(typeof orderService.placeOrder).toBe("function");
});

test("traced placeOrder produces single root trace node", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  orderService.placeOrder("C1", "P1", 2);
  const trace = narrativeContext.captureTrace();
  expect(trace.roots).toHaveLength(1);
});

test("root trace node has OrderService.placeOrder signature", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  orderService.placeOrder("C1", "P1", 2);
  const trace = narrativeContext.captureTrace();
  expect(trace.roots[0]?.signature.className).toBe("OrderService");
  expect(trace.roots[0]?.signature.methodName).toBe("placeOrder");
});

test("root trace node has returned outcome", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  orderService.placeOrder("C1", "P1", 2);
  const trace = narrativeContext.captureTrace();
  expect(trace.roots[0]?.outcome.kind).toBe("returned");
});

test("traced placeOrder has four child service calls", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  orderService.placeOrder("C1", "P1", 2);
  const trace = narrativeContext.captureTrace();
  const classNames = trace.roots[0]?.children.map((c) => c.signature.className);
  expect(classNames).toContain("CustomerService");
  expect(classNames).toContain("CatalogService");
  expect(classNames).toContain("InventoryService");
  expect(classNames).toContain("PaymentService");
});

test("createTracedServices with explicit context produces same trace structure", () => {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const orderService = createTracedServices(ctx);
  orderService.placeOrder("C1", "P1", 1);
  const trace = ctx.captureTrace();
  expect(trace.roots).toHaveLength(1);
  expect(trace.roots[0]?.signature.className).toBe("OrderService");
  expect(trace.roots[0]?.children.length).toBeGreaterThanOrEqual(4);
});

test("renderIndentedText produces output containing class names", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  orderService.placeOrder("C1", "P1", 2);
  const trace = narrativeContext.captureTrace();
  const output = renderIndentedText(trace);
  expect(output.length).toBeGreaterThan(0);
  expect(output).toContain("OrderService");
});

test("traced error path captures threw outcome", () => {
  const { orderService, narrativeContext } = createTracedOrderService();
  try {
    orderService.placeOrder("C3", "P1", 1);
  } catch {
    // expected: payment declined for C3
  }
  const trace = narrativeContext.captureTrace();
  expect(trace.roots).toHaveLength(1);
  expect(trace.roots[0]?.outcome.kind).toBe("threw");
});
