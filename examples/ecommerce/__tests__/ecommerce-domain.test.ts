// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import {
  type Customer,
  type CustomerTier,
  DefaultOrderService,
  InMemoryCatalogService,
  InMemoryCustomerService,
  InMemoryInventoryService,
  InMemoryPaymentService,
  type OrderResult,
  type PaymentConfirmation,
  type Reservation,
  StubNotificationService,
} from "../src/index.js";

test("barrel re-exports all domain modules", () => {
  expect(DefaultOrderService).toBeDefined();
  expect(InMemoryCatalogService).toBeDefined();
  expect(InMemoryCustomerService).toBeDefined();
  expect(InMemoryInventoryService).toBeDefined();
  expect(InMemoryPaymentService).toBeDefined();
  expect(StubNotificationService).toBeDefined();
});

test("Customer has id, name, and tier", () => {
  const customer: Customer = { id: "C1", name: "Alice", tier: "gold" };
  expect(customer.id).toBe("C1");
  expect(customer.name).toBe("Alice");
  expect(customer.tier).toBe("gold");
});

test("CustomerTier accepts all valid values", () => {
  const tiers: CustomerTier[] = ["standard", "gold", "platinum"];
  expect(tiers).toHaveLength(3);
});

test("Reservation has productId and quantity", () => {
  const reservation: Reservation = { productId: "P1", quantity: 5 };
  expect(reservation.productId).toBe("P1");
  expect(reservation.quantity).toBe(5);
});

test("PaymentConfirmation has transactionId and amount", () => {
  const confirmation: PaymentConfirmation = { transactionId: "TX-1", amount: 99.99 };
  expect(confirmation.transactionId).toBe("TX-1");
  expect(confirmation.amount).toBe(99.99);
});

test("OrderResult has all order fields", () => {
  const result: OrderResult = {
    orderId: "ORD-1",
    transactionId: "TX-1",
    totalCharged: 199.98,
    itemCount: 2,
  };
  expect(result.orderId).toBe("ORD-1");
  expect(result.transactionId).toBe("TX-1");
  expect(result.totalCharged).toBe(199.98);
  expect(result.itemCount).toBe(2);
});

// CustomerService

test("InMemoryCustomerService returns known customer", () => {
  const service = new InMemoryCustomerService();
  const customer = service.findCustomer("C1");
  expect(customer).toStrictEqual({ id: "C1", name: "Alice", tier: "gold" });
});

test("InMemoryCustomerService throws for unknown customer", () => {
  const service = new InMemoryCustomerService();
  expect(() => service.findCustomer("UNKNOWN")).toThrow("Customer not found: UNKNOWN");
});

// ProductCatalogService

test("InMemoryCatalogService returns price for known product", () => {
  const service = new InMemoryCatalogService();
  expect(service.lookupPrice("P1")).toBe(29.99);
  expect(service.lookupPrice("P2")).toBe(49.99);
  expect(service.lookupPrice("P3")).toBe(9.99);
});

test("InMemoryCatalogService throws for unknown product", () => {
  const service = new InMemoryCatalogService();
  expect(() => service.lookupPrice("UNKNOWN")).toThrow("Product not found: UNKNOWN");
});

// InventoryService

test("InMemoryInventoryService reserves stock", () => {
  const service = new InMemoryInventoryService();
  const reservation = service.reserve("P1", 3);
  expect(reservation).toStrictEqual({ productId: "P1", quantity: 3 });
});

test("InMemoryInventoryService throws for unknown product", () => {
  const service = new InMemoryInventoryService();
  expect(() => service.reserve("UNKNOWN", 1)).toThrow("Product not found: UNKNOWN");
});

test("InMemoryInventoryService throws on insufficient stock", () => {
  const service = new InMemoryInventoryService();
  expect(() => service.reserve("P2", 999)).toThrow(
    "Insufficient stock for P2: requested 999, available 50",
  );
});

test("InMemoryInventoryService releases stock", () => {
  const service = new InMemoryInventoryService();
  service.reserve("P3", 200);
  service.release("P3", 200);
  const reservation = service.reserve("P3", 200);
  expect(reservation.quantity).toBe(200);
});

test("InMemoryInventoryService release on unknown product starts from zero", () => {
  const service = new InMemoryInventoryService();
  service.release("NEW_PRODUCT", 10);
  const reservation = service.reserve("NEW_PRODUCT", 5);
  expect(reservation).toStrictEqual({ productId: "NEW_PRODUCT", quantity: 5 });
});

// PaymentService

test("InMemoryPaymentService charges successfully", () => {
  const service = new InMemoryPaymentService();
  const confirmation = service.charge("C1", 59.98, "tok_C1");
  expect(confirmation.transactionId).toMatch(/^TX-\d+$/);
  expect(confirmation.amount).toBe(59.98);
});

test("InMemoryPaymentService declines Charlie", () => {
  const service = new InMemoryPaymentService();
  expect(() => service.charge("C3", 10, "tok_C3")).toThrow("Payment declined for customer: C3");
});

// NotificationService

test("StubNotificationService records sent notifications", async () => {
  const service = new StubNotificationService();
  const result = await service.notifyOrderPlaced("C1", "ORD-1");
  expect(result).toBe(true);
  expect(service.sent).toStrictEqual([{ customerId: "C1", orderId: "ORD-1" }]);
});

// DefaultOrderService

function createOrderService() {
  return new DefaultOrderService(
    new InMemoryCustomerService(),
    new InMemoryCatalogService(),
    new InMemoryInventoryService(),
    new InMemoryPaymentService(),
  );
}

test("DefaultOrderService places order successfully", () => {
  const service = createOrderService();
  const result = service.placeOrder("C1", "P1", 2);
  expect(result.orderId).toMatch(/^ORD-\d+$/);
  expect(result.transactionId).toMatch(/^TX-\d+$/);
  expect(result.totalCharged).toBe(59.98);
  expect(result.itemCount).toBe(2);
});

test("DefaultOrderService fails for unknown customer", () => {
  const service = createOrderService();
  expect(() => service.placeOrder("UNKNOWN", "P1", 1)).toThrow("Customer not found: UNKNOWN");
});

test("DefaultOrderService fails for unknown product", () => {
  const service = createOrderService();
  expect(() => service.placeOrder("C1", "UNKNOWN", 1)).toThrow("Product not found: UNKNOWN");
});

test("DefaultOrderService fails on insufficient stock", () => {
  const service = createOrderService();
  expect(() => service.placeOrder("C1", "P2", 999)).toThrow("Insufficient stock for P2");
});

test("DefaultOrderService fails when payment declined", () => {
  const service = createOrderService();
  expect(() => service.placeOrder("C3", "P1", 1)).toThrow("Payment declined for customer: C3");
});

test("DefaultOrderService rejects zero quantity", () => {
  const service = createOrderService();
  expect(() => service.placeOrder("C1", "P1", 0)).toThrow("Quantity must be at least 1");
});

test("DefaultOrderService rejects negative quantity", () => {
  const service = createOrderService();
  expect(() => service.placeOrder("C1", "P1", -5)).toThrow("Quantity must be at least 1");
});
