// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/parallel-wiring.ts
import type { NarrativeContext } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { RuleBasedFraudCheck } from "../src/fraud-check.js";
import { InMemoryInventory } from "../src/inventory.js";
import { InMemoryOrderRepository } from "../src/orders.js";
import { ParallelCheckout, type ParallelCollaborators } from "../src/parallel-checkout.js";
import { CardPaymentService } from "../src/payments.js";

/** What a scenario reads back: the traced parallel checkout and the real state behind it. */
export interface TracedParallelCheckout {
  readonly checkout: ParallelCheckout;
  readonly stock: InMemoryInventory;
  readonly repository: InMemoryOrderRepository;
  /** The collaborators traced by `context` — what a task that skips the handover uses. */
  readonly collaboratorsFor: (context: NarrativeContext) => ParallelCollaborators;
}

/**
 * The parallel checkout over real in-memory collaborators. The collaborators are wrapped once per
 * context asked for, under the interfaces' class names, so a task's calls render exactly like the
 * caller's.
 */
export function tracedParallelCheckout(
  context: NarrativeContext,
  units = 5,
): TracedParallelCheckout {
  const stock = new InMemoryInventory("SKU-KB", units);
  const repository = new InMemoryOrderRepository();
  const collaboratorsFor = (traced: NarrativeContext): ParallelCollaborators => ({
    inventory: traceObject(
      stock,
      traced,
      { reserve: ["sku", "quantity"], release: ["sku", "quantity"] },
      { className: "InventoryService" },
    ),
    fraud: traceObject(
      new RuleBasedFraudCheck(),
      traced,
      { approve: ["customerId", "amountCents"] },
      { className: "FraudCheckService" },
    ),
    payments: traceObject(
      new CardPaymentService(),
      traced,
      { charge: ["customerId", "amountCents", "card"] },
      { className: "PaymentService" },
    ),
    orders: traceObject(repository, traced, { save: ["order"] }, { className: "OrderRepository" }),
  });
  const checkout = traceObject(
    new ParallelCheckout(context, collaboratorsFor),
    context,
    { placeOrder: ["customerId", "sku", "quantity", "cardNumber"] },
    { className: "OrderService" },
  );
  return { checkout, stock, repository, collaboratorsFor };
}
