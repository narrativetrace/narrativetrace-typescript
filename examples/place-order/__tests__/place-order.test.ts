// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import pino, { type Logger } from "pino";
import { describe, expect, it } from "vitest";
import type {
  CatalogService,
  Collaborators,
  CustomerService,
  InventoryService,
  Order,
  OrderRepository,
  OrderRequest,
  PaymentService,
} from "../src/place-order.js";
import { OrderServiceAfter, OrderServiceBefore } from "../src/place-order.js";

// Tests behind README.md's "problem" section (`src/place-order.ts`): proves the "before" and
// "after" methods really run, and that the only behavioral difference between them is the
// deleted log lines — both return the same value on success and let the same exception through
// on failure.

class FakeCustomerService implements CustomerService {
  find(customerId: string): string {
    return customerId;
  }
}

class FakeCatalogService implements CatalogService {
  price(_sku: string): number {
    return 42;
  }
}

class FakeInventoryService implements InventoryService {
  reserve(_sku: string, _qty: number): void {}
}

class FakePaymentService implements PaymentService {
  charge(_amount: number): string {
    return "txn-1";
  }
}

class DecliningPaymentService implements PaymentService {
  charge(_amount: number): string {
    throw new Error("payment declined");
  }
}

class FakeOrderRepository implements OrderRepository {
  save(customer: string, _payment: string): Order {
    return { id: `ORD-${customer}` };
  }
}

function collaborators(overrides: Partial<Collaborators> = {}): Collaborators {
  return {
    customers: new FakeCustomerService(),
    catalog: new FakeCatalogService(),
    inventory: new FakeInventoryService(),
    payments: new FakePaymentService(),
    orders: new FakeOrderRepository(),
    ...overrides,
  };
}

const REQUEST: OrderRequest = { id: "C-1234", sku: "SKU-KB", qty: 2 };

/** A real pino instance whose destination captures each emitted line as a parsed object,
 * synchronously — the same capture pattern `packages/pino`'s own tests use. */
function capturingLogger(): { logger: Logger; events: Record<string, unknown>[] } {
  const events: Record<string, unknown>[] = [];
  const logger = pino({ level: "info" }, { write: (msg: string) => events.push(JSON.parse(msg)) });
  return { logger, events };
}

describe("OrderServiceBefore.placeOrder", () => {
  it("logs entry and success, and returns the saved order", () => {
    const { logger, events } = capturingLogger();
    const service = new OrderServiceBefore(logger, collaborators());

    const order = service.placeOrder(REQUEST);

    expect(order).toEqual({ id: "ORD-C-1234" });
    expect(events.map((e) => e.msg)).toEqual(["Placing order", "Order succeeded"]);
    expect(events[0]?.orderId).toBe("C-1234");
    expect(events[1]?.orderId).toBe("ORD-C-1234");
  });

  it("logs the failure and still rethrows the same error", () => {
    const { logger, events } = capturingLogger();
    const declined = collaborators({ payments: new DecliningPaymentService() });
    const service = new OrderServiceBefore(logger, declined);

    expect(() => service.placeOrder(REQUEST)).toThrow("payment declined");

    const failure = events.find((e) => e.msg === "Placing order failed");
    expect(failure?.orderId).toBe("C-1234");
    expect(failure?.err).toBeDefined();
  });
});

describe("OrderServiceAfter.placeOrder", () => {
  it("returns the same order with zero log lines", () => {
    const service = new OrderServiceAfter(collaborators());
    expect(service.placeOrder(REQUEST)).toEqual({ id: "ORD-C-1234" });
  });

  it("throws the same error with zero log lines", () => {
    const declined = collaborators({ payments: new DecliningPaymentService() });
    const service = new OrderServiceAfter(declined);
    expect(() => service.placeOrder(REQUEST)).toThrow("payment declined");
  });
});

describe("before/after parity", () => {
  it("return the identical order — the only difference is the deleted log lines", () => {
    const before = new OrderServiceBefore(capturingLogger().logger, collaborators());
    const after = new OrderServiceAfter(collaborators());

    expect(after.placeOrder(REQUEST)).toEqual(before.placeOrder(REQUEST));
  });

  it("let the identical error through — the only difference is the deleted log lines", () => {
    const before = new OrderServiceBefore(
      capturingLogger().logger,
      collaborators({ payments: new DecliningPaymentService() }),
    );
    const after = new OrderServiceAfter(collaborators({ payments: new DecliningPaymentService() }));

    let beforeError: unknown;
    let afterError: unknown;
    try {
      before.placeOrder(REQUEST);
    } catch (err) {
      beforeError = err;
    }
    try {
      after.placeOrder(REQUEST);
    } catch (err) {
      afterError = err;
    }

    expect((afterError as Error).message).toBe((beforeError as Error).message);
  });
});
