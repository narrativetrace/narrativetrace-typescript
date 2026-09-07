// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext } from "@narrativetrace/core-node";
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { InMemoryCatalogService } from "./catalog-service.js";
import { InMemoryCustomerService } from "./customer-service.js";
import { InMemoryInventoryService } from "./inventory-service.js";
import type { NotificationService } from "./notification-service.js";
import { StubNotificationService } from "./notification-service.js";
import type { OrderService } from "./order-service.js";
import { DefaultOrderService } from "./order-service.js";
import { InMemoryPaymentService } from "./payment-service.js";

export type TracedOrderContext = {
  readonly orderService: OrderService;
  readonly narrativeContext: NarrativeContext;
};

export function createTracedServices(ctx: NarrativeContext): OrderService {
  return traceObject(
    new DefaultOrderService(
      traceObject(new InMemoryCustomerService(), ctx, undefined, { className: "CustomerService" }),
      traceObject(new InMemoryCatalogService(), ctx, undefined, { className: "CatalogService" }),
      traceObject(new InMemoryInventoryService(), ctx, undefined, {
        className: "InventoryService",
      }),
      traceObject(new InMemoryPaymentService(), ctx, undefined, { className: "PaymentService" }),
    ),
    ctx,
    undefined,
    { className: "OrderService" },
  );
}

/** The (stub) notification channel, traced under the interface name like the other services. */
export function createTracedNotificationService(ctx: NarrativeContext): NotificationService {
  return traceObject(new StubNotificationService(), ctx, undefined, {
    className: "NotificationService",
  });
}

export function createTracedOrderService(): TracedOrderContext {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
  return { orderService: createTracedServices(ctx), narrativeContext: ctx };
}
