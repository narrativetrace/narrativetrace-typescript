// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { useTraceCapture, useTraced, useTracedFetch } from "@narrativetrace/react";
import { type FormEvent, useState } from "react";
import type { OrderErrorResponse, OrderResponse, OrderResult } from "./order-service.js";
import { OrderService } from "./order-service.js";

export function OrderForm() {
  const tracedFetch = useTracedFetch();
  const svc = useTraced(() => new OrderService(tracedFetch), "OrderService");
  const { captureAndReset } = useTraceCapture();
  const [customerId, setCustomerId] = useState("C-1");
  const [productId, setProductId] = useState("SKU-1");
  const [quantity, setQuantity] = useState(1);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverTrace, setServerTrace] = useState<string>("");
  const [clientTrace, setClientTrace] = useState<string>("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setOrder(null);
    setError(null);
    const res = await svc.placeOrder(customerId, productId, quantity);
    const clientTree = captureAndReset();
    setClientTrace(JSON.stringify(clientTree, null, 2));
    if (res.ok) {
      const data: OrderResponse = await res.json();
      setOrder(data.order);
      setServerTrace(JSON.stringify(data.trace, null, 2));
    } else {
      const data: OrderErrorResponse = await res.json();
      setError(data.error);
      setServerTrace(JSON.stringify(data.trace, null, 2));
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="customer">Customer</label>
        <select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="C-1">C-1</option>
          <option value="C-2">C-2</option>
        </select>

        <label htmlFor="product">Product</label>
        <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="SKU-1">SKU-1</option>
          <option value="SKU-2">SKU-2</option>
        </select>

        <label htmlFor="quantity">Quantity</label>
        <select
          id="quantity"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        >
          {[1, 2, 5, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <button type="submit">Place Order</button>
      </form>

      {order && (
        <div data-testid="result">
          <div data-testid="order-id">{order.orderId}</div>
          <div data-testid="total">{order.totalCharged}</div>
          <div data-testid="txn">{order.transactionId}</div>
        </div>
      )}

      {error && <div data-testid="error">{error}</div>}

      {clientTrace && <pre data-testid="client-trace">{clientTrace}</pre>}

      {serverTrace && <pre data-testid="server-trace">{serverTrace}</pre>}
    </div>
  );
}
