// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceProvider, useTraced } from "@narrativetrace/react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NavigationTracer } from "./navigation-tracer.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

class OrderService {
  placeOrder(customerId: string): string {
    return `order for ${customerId}`;
  }
}

function CartPage() {
  const orders = useTraced(() => new OrderService(), "OrderService");
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid="checkout"
      onClick={() => {
        orders.placeOrder("C-1");
        navigate("/done");
      }}
    >
      Checkout
    </button>
  );
}

describe("the react-router row's wiring snippet", () => {
  test("prints the calls a page made when the user navigates away from it", () => {
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => printed.push(line));
    render(
      <MemoryRouter initialEntries={["/cart"]}>
        <NarrativeTraceProvider>
          <NavigationTracer />
          <Routes>
            <Route path="/cart" element={<CartPage />} />
            <Route path="/done" element={<p>done</p>} />
          </Routes>
        </NarrativeTraceProvider>
      </MemoryRouter>,
    );

    act(() => screen.getByTestId("checkout").click());

    expect(printed.some((line) => line.includes("OrderService.placeOrder("))).toBe(true);
  });
});
