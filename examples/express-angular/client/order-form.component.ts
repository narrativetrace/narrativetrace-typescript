// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { JsonPipe } from "@angular/common";
import type { HttpErrorResponse } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { NARRATIVE_CONTEXT, TraceCaptureService } from "@narrativetrace/angular";
import { renderIndentedText, type TraceTree } from "@narrativetrace/core";
import { type OrderResponse, OrderService } from "./order.service.js";

@Component({
  selector: "app-order-form",
  standalone: true,
  imports: [JsonPipe],
  template: `
    <h1>Angular + Express Order Demo</h1>
    <form (submit)="submitOrder($event)">
      <label>Customer
        <select name="customerId">
          @for (c of customers; track c.id) {
            <option [value]="c.id">{{ c.label }}</option>
          }
        </select>
      </label>
      <label>Product
        <select name="productId">
          @for (p of products; track p.id) {
            <option [value]="p.id">{{ p.label }}</option>
          }
        </select>
      </label>
      <label>Quantity
        <input name="quantity" type="number" value="1" min="1" max="100" />
      </label>
      <button type="submit">Place Order</button>
    </form>

    <p class="trace-id">Trace ID: {{ traceId() }}</p>

    @if (errorMessage()) {
      <h2>Error</h2>
      <pre class="error">{{ errorMessage() }}</pre>
    }

    @if (orderResult()) {
      <h2>Order Result</h2>
      <pre class="order-result">{{ orderResult() | json }}</pre>
    }

    @if (clientTraceText()) {
      <h2>Client Trace (Angular)</h2>
      <pre class="client-trace">{{ clientTraceText() }}</pre>
    }

    @if (serverTraceText()) {
      <h2>Server Trace (Express)</h2>
      <pre class="server-trace">{{ serverTraceText() }}</pre>
    }
  `,
  styles: `
    :host { display: block; font-family: system-ui, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    select, input { margin-top: 4px; padding: 6px; font-size: 14px; }
    button { margin-top: 16px; padding: 8px 20px; font-size: 14px; cursor: pointer; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; max-height: 300px; font-size: 13px; }
    .error { color: #c00; }
    .trace-id { font-family: monospace; color: #666; }
  `,
})
export class OrderFormComponent {
  private readonly orderService = inject(OrderService);
  private readonly traceCapture = inject(TraceCaptureService);
  private readonly ctx = inject(NARRATIVE_CONTEXT);

  readonly customers = [
    { id: "C1", label: "C1 — Alice (gold)" },
    { id: "C2", label: "C2 — Bob (standard)" },
    { id: "C3", label: "C3 — Charlie (platinum)" },
  ];

  readonly products = [
    { id: "P1", label: "P1 — $29.99" },
    { id: "P2", label: "P2 — $49.99" },
    { id: "P3", label: "P3 — $9.99" },
  ];

  readonly orderResult = signal<OrderResponse["order"] | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly clientTraceText = signal<string | null>(null);
  readonly serverTraceText = signal<string | null>(null);
  readonly traceId = signal<string>("");

  submitOrder(event: Event): void {
    event.preventDefault();
    const form = (event.target as HTMLFormElement).elements;
    const customerId = (form.namedItem("customerId") as HTMLSelectElement).value;
    const productId = (form.namedItem("productId") as HTMLSelectElement).value;
    const quantity = Number((form.namedItem("quantity") as HTMLInputElement).value);

    this.traceCapture.reset();
    this.orderResult.set(null);
    this.errorMessage.set(null);
    this.clientTraceText.set(null);
    this.serverTraceText.set(null);
    this.traceId.set(this.ctx.traceId());

    this.orderService.placeOrder({ customerId, productId, quantity }).subscribe({
      next: (response) => {
        this.orderResult.set(response.order);
        this.serverTraceText.set(renderIndentedText(response.trace as TraceTree));
        this.clientTraceText.set(renderIndentedText(this.traceCapture.captureAndReset()));
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(err.error?.error ?? err.message);
        if (err.error?.trace) {
          this.serverTraceText.set(renderIndentedText(err.error.trace as TraceTree));
        }
        this.clientTraceText.set(renderIndentedText(this.traceCapture.captureAndReset()));
      },
    });
  }
}
