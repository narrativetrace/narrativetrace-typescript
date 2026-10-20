// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/parallel-checkout.ts
import { ForkJoinGroup, type NarrativeContext } from "@narrativetrace/core-node";
import type { FraudCheckService } from "./fraud-check.js";
import type { InventoryService } from "./inventory.js";
import type { Order, OrderRepository } from "./orders.js";
import { PaymentDeclinedError, type PaymentService } from "./payments.js";
import type { RemoteOrderService } from "./remote-order-service.js";

const UNIT_PRICE_CENTS = 3999;

/** The collaborators of one checkout, as traced by one particular context. */
export interface ParallelCollaborators {
  readonly inventory: InventoryService;
  readonly fraud: FraudCheckService;
  readonly payments: PaymentService;
  readonly orders: OrderRepository;
}

/** Builds the collaborators traced by `context` — the caller's, or a forked task's. */
export type CollaboratorsFor = (context: NarrativeContext) => ParallelCollaborators;

/**
 * The checkout with its two slow steps run side by side: reserve the stock and ask the fraud check
 * at once, wait for both, then charge and save.
 *
 * INTENT: shows the handover for documentation/recipes/follow-a-flow-across-threads.md.
 * `ForkJoinGroup.all` gives each task a forked context that carries the caller's trace id and the
 * span that launched it, so a task must do its traced work through collaborators traced by THAT
 * context — hence `collaboratorsFor`, called once for the caller and once per task. The group joins
 * the tasks back under the launching span when every one has settled.
 *
 * @llmNote Reaching for the caller's own traced collaborators inside a task is the mistake this
 * class exists to avoid: the call would run, and the trace would not know the task belonged to it.
 *
 * @sideEffects Reserves stock; a refused order releases the reservation before it throws, like
 * `DefaultOrderService`.
 */
export class ParallelCheckout implements RemoteOrderService {
  private readonly local: ParallelCollaborators;

  constructor(
    private readonly context: NarrativeContext,
    private readonly collaboratorsFor: CollaboratorsFor,
  ) {
    this.local = collaboratorsFor(context);
  }

  async placeOrder(
    customerId: string,
    sku: string,
    quantity: number,
    cardNumber: string,
  ): Promise<string> {
    const amountCents = UNIT_PRICE_CENTS * quantity;
    const [, approved] = await ForkJoinGroup.all(this.context, [
      (forked) => this.collaboratorsFor(forked).inventory.reserve(sku, quantity),
      (forked) => this.collaboratorsFor(forked).fraud.approve(customerId, amountCents),
    ]);
    if (!approved) {
      this.local.inventory.release(sku, quantity);
      throw new PaymentDeclinedError("the fraud check refused the order");
    }
    this.local.payments.charge(customerId, amountCents, cardNumber);
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.local.orders.save(order);
    return orderId;
  }
}
