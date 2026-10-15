// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/wiring.ts
import type { NarrativeContext } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { InMemoryInventory, type InventoryService } from "../src/inventory.js";
import { DefaultOrderService, type OrderService } from "../src/order-service.js";
import { InMemoryOrderRepository, type OrderRepository } from "../src/orders.js";
import { CardPaymentService, type PaymentService } from "../src/payments.js";

/** The three collaborators a checkout is built from, as the scenario's tests hand them over. */
export interface Collaborators {
  readonly inventory: InventoryService;
  readonly payments: PaymentService;
  readonly orders: OrderRepository;
}

/** Builds the checkout under test from the (already traced) collaborators. */
export type CheckoutFactory = (collaborators: Collaborators) => OrderService;

/** What a scenario reads back: the traced checkout, and the real stock and repository behind it. */
export interface TracedCheckout {
  readonly checkout: OrderService;
  readonly stock: InMemoryInventory;
  readonly repository: InMemoryOrderRepository;
}

const defaultCheckout: CheckoutFactory = ({ inventory, payments, orders }) =>
  new DefaultOrderService(inventory, payments, orders);

/**
 * The checkout every recipe runs, wired the way the first recipe wires it: each collaborator
 * wrapped once where it is constructed, the checkout itself last. The class names are the
 * interfaces' — a trace names what a caller depends on, so two implementations of one interface
 * render as the same call and one approved baseline compares across them.
 */
export function tracedCheckout(
  context: NarrativeContext,
  makeCheckout: CheckoutFactory = defaultCheckout,
): TracedCheckout {
  const stock = new InMemoryInventory("SKU-KB", 5);
  const repository = new InMemoryOrderRepository();
  const inventory = traceObject(
    stock,
    context,
    { reserve: ["sku", "quantity"], release: ["sku", "quantity"] },
    { className: "InventoryService" },
  );
  const payments = traceObject(
    new CardPaymentService(),
    context,
    { charge: ["customerId", "amountCents", "card"] },
    { className: "PaymentService" },
  );
  const orders = traceObject(
    repository,
    context,
    { save: ["order"] },
    { className: "OrderRepository" },
  );
  const checkout = traceObject(
    makeCheckout({ inventory, payments, orders }),
    context,
    { placeOrder: ["customerId", "sku", "quantity", "cardNumber"] },
    { className: "OrderService" },
  );
  return { checkout, stock, repository };
}
