// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Logger } from "pino";

// `PlaceOrder` — the README "problem" section example, run and tested for real (README.md
// #the-problem; the same method embedded in every runtime's README and the website's
// before/after panels: five collaborators, two success log lines that say nothing about the
// four calls between them, one catch that logs and rethrows).
//
// `OrderServiceBefore.placeOrder` and `OrderServiceAfter.placeOrder` are the literal
// "before"/"after" blocks the README embeds via `<!-- snippet: examples/place-order/src/place-
// order.ts region=before -->` / `region=after` — the only difference between the two is the
// deleted log lines; everything else (collaborators, call order, exception type) is identical.

/** The inbound request `placeOrder` is handed. */
export interface OrderRequest {
  readonly id: string;
  readonly sku: string;
  readonly qty: number;
}

/** The saved order `placeOrder` returns. */
export interface Order {
  readonly id: string;
}

export interface CustomerService {
  find(customerId: string): string;
}

export interface CatalogService {
  price(sku: string): number;
}

export interface InventoryService {
  reserve(sku: string, qty: number): void;
}

export interface PaymentService {
  charge(amount: number): string;
}

export interface OrderRepository {
  save(customer: string, payment: string): Order;
}

/** The five collaborators `placeOrder` calls, one per runtime's version of this example. */
export interface Collaborators {
  readonly customers: CustomerService;
  readonly catalog: CatalogService;
  readonly inventory: InventoryService;
  readonly payments: PaymentService;
  readonly orders: OrderRepository;
}

/** Wiring shared by the "before" and "after" services — only `placeOrder` differs. */
abstract class OrderServiceBase {
  protected readonly customers: CustomerService;
  protected readonly catalog: CatalogService;
  protected readonly inventory: InventoryService;
  protected readonly payments: PaymentService;
  protected readonly orders: OrderRepository;

  constructor(collaborators: Collaborators) {
    this.customers = collaborators.customers;
    this.catalog = collaborators.catalog;
    this.inventory = collaborators.inventory;
    this.payments = collaborators.payments;
    this.orders = collaborators.orders;
  }
}

/** Before — three hand-written pino log lines carry the story around the business logic. */
export class OrderServiceBefore extends OrderServiceBase {
  constructor(
    private readonly logger: Logger,
    collaborators: Collaborators,
  ) {
    super(collaborators);
  }

  // snippet:begin before
  placeOrder(req: OrderRequest): Order {
    this.logger.info({ orderId: req.id }, "Placing order");
    try {
      const customer = this.customers.find(req.id);
      const price = this.catalog.price(req.sku);
      this.inventory.reserve(req.sku, req.qty);
      const payment = this.payments.charge(price);
      const order = this.orders.save(customer, payment);
      this.logger.info({ orderId: order.id }, "Order succeeded");
      return order;
    } catch (err) {
      this.logger.error({ err, orderId: req.id }, "Placing order failed");
      throw err;
    }
  }
  // snippet:end before
}

/** After — the same method, zero log lines; NarrativeTrace captures the narrative. */
export class OrderServiceAfter extends OrderServiceBase {
  // snippet:begin after
  placeOrder(req: OrderRequest): Order {
    const customer = this.customers.find(req.id);
    const price = this.catalog.price(req.sku);
    this.inventory.reserve(req.sku, req.qty);
    const payment = this.payments.charge(price);
    return this.orders.save(customer, payment);
  }
  // snippet:end after
}
