// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export { InMemoryCatalogService, type ProductCatalogService } from "./catalog-service.js";
export { type CustomerService, InMemoryCustomerService } from "./customer-service.js";
export type {
  Customer,
  CustomerTier,
  OrderResult,
  PaymentConfirmation,
  Reservation,
} from "./domain.js";
export { ExternalServiceError } from "./external-service-error.js";
export { FlakyNotificationService } from "./flaky-notification-service.js";
export { InMemoryInventoryService, type InventoryService } from "./inventory-service.js";
export { type NotificationService, StubNotificationService } from "./notification-service.js";
export { DefaultOrderService, type OrderService } from "./order-service.js";
export { InMemoryPaymentService, type PaymentService } from "./payment-service.js";
export { RemoteCatalogService } from "./remote-catalog-service.js";
export {
  createDemoContext,
  type Scenario,
  type ScenarioContext,
} from "./scenario.js";
export { scenarios } from "./scenarios.js";
export {
  createTracedNotificationService,
  createTracedOrderService,
  createTracedServices,
  type TracedOrderContext,
} from "./traced-services.js";
