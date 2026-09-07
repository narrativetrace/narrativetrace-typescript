// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// @vitest-environment jsdom
import "@narrativetrace/core-web";
import { NarrativeTraceProvider, useTraced, useTracedFetch } from "@narrativetrace/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OrderService } from "../client/order-service.js";

afterEach(cleanup);

let lastRequest: { url: string; body: unknown; headers: Headers } | undefined;

beforeEach(() => {
  lastRequest = undefined;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    lastRequest = {
      url: String(input),
      body: JSON.parse(init?.body as string),
      headers: new Headers(init?.headers),
    };
    return new Response(
      JSON.stringify({
        order: { orderId: "ORD-1", transactionId: "TXN-1", totalCharged: 9.99 },
        trace: { roots: [{ name: "test" }] },
      }),
      { status: 200 },
    );
  });
});

afterEach(() => vi.restoreAllMocks());

function ServiceTest() {
  const tracedFetch = useTracedFetch();
  const svc = useTraced(() => new OrderService(tracedFetch), "OrderService");
  svc.placeOrder("C-1", "SKU-1", 2);
  return <div data-testid="called">true</div>;
}

describe("OrderService", () => {
  test("placeOrder sends POST to /orders", () => {
    render(
      <NarrativeTraceProvider>
        <ServiceTest />
      </NarrativeTraceProvider>,
    );
    expect(lastRequest?.url).toBe("/orders");
    expect(lastRequest?.body).toEqual({ customerId: "C-1", productId: "SKU-1", quantity: 2 });
  });

  test("placeOrder sends traceparent header", () => {
    render(
      <NarrativeTraceProvider>
        <ServiceTest />
      </NarrativeTraceProvider>,
    );
    const tp = lastRequest?.headers.get("traceparent") ?? "";
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });
});
