// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// @vitest-environment jsdom
import "@narrativetrace/core-web";
import { NarrativeTraceProvider } from "@narrativetrace/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OrderForm } from "../client/order-form.js";

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal("fetch", async () => {
    return new Response(
      JSON.stringify({
        order: { orderId: "ORD-1", transactionId: "TXN-1", totalCharged: 9.99 },
        trace: { roots: [] },
      }),
      { status: 200 },
    );
  });
});

afterEach(() => vi.restoreAllMocks());

function renderForm() {
  return render(
    <NarrativeTraceProvider>
      <OrderForm />
    </NarrativeTraceProvider>,
  );
}

describe("OrderForm", () => {
  test("renders form with selects and submit button", () => {
    renderForm();
    expect(screen.getByLabelText("Customer")).toBeDefined();
    expect(screen.getByLabelText("Product")).toBeDefined();
    expect(screen.getByLabelText("Quantity")).toBeDefined();
    expect(screen.getByRole("button", { name: "Place Order" })).toBeDefined();
  });

  test("submit displays order result", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));
    await waitFor(() => {
      expect(screen.getByTestId("order-id").textContent).toBe("ORD-1");
    });
    expect(screen.getByTestId("total").textContent).toBe("9.99");
  });

  test("submit displays error on failure", async () => {
    vi.stubGlobal("fetch", async () => {
      return new Response(JSON.stringify({ error: "Insufficient stock", trace: { roots: [] } }), {
        status: 400,
      });
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));
    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("Insufficient stock");
    });
  });

  test("submit captures client trace", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));
    await waitFor(() => {
      expect(screen.getByTestId("client-trace")).toBeDefined();
    });
  });

  test("submit captures server trace", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));
    await waitFor(() => {
      expect(screen.getByTestId("server-trace")).toBeDefined();
    });
  });
});
