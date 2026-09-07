// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { narrated, onError } from "../src/narrated.js";
import { notTraced } from "../src/not-traced.js";
import { traceObject } from "../src/trace-object.js";
import { traced } from "../src/traced.js";

describe("@narrated decorator", () => {
  test("resolves {param} placeholders unquoted against the arguments", () => {
    class Greeter {
      @narrated("Greeting {name}")
      @traced("name")
      greet(name: string): string {
        return `Hi ${name}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new Greeter(), ctx);
    svc.greet("Alice");
    const node = ctx.captureTrace().roots[0];
    expect(node?.signature.narration).toBe("Greeting Alice");
  });

  test("a redacted param resolves to the marker inside the narration", () => {
    class Auth {
      @narrated("Login with {password}")
      @notTraced(0)
      @traced("password")
      login(password: string): string {
        return `ok-${password}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new Auth(), ctx);
    svc.login("hunter2");
    const node = ctx.captureTrace().roots[0];
    expect(node?.signature.narration).toBe("Login with [REDACTED]");
    expect(node?.signature.narration).not.toContain("hunter2");
  });

  test("a property path naming a static notTraced member redacts, end to end through the proxy", () => {
    class Card {
      static readonly notTraced = ["cvv"];
      constructor(
        readonly last4: string,
        readonly cvv: string,
      ) {}
    }
    class PaymentService {
      @narrated("Charging card ending {card.last4}, cvv {card.cvv}")
      @traced("card")
      charge(card: Card): string {
        return `ok-${card.last4}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new PaymentService(), ctx);
    svc.charge(new Card("4111", "123"));
    const node = ctx.captureTrace().roots[0];

    expect(node?.signature.narration).toBe("Charging card ending 4111, cvv [REDACTED]");
    expect(node?.signature.narration).not.toContain("123");
  });

  test("a whole-object placeholder naming a param with a notTraced field redacts, end to end through the proxy", () => {
    // Same guarantee as the dotted-path test above, but the template names the object itself
    // ({card}, no dot) rather than the property — resolveTemplate routes this through
    // value-renderer's default field-dump (no custom toString here, unlike the core unit tests
    // that cover the toString-bypass shape), a route this port's one capture path had never
    // exercised end to end.
    class Card {
      static readonly notTraced = ["cvv"];
      constructor(
        readonly last4: string,
        readonly cvv: string,
      ) {}
    }
    class PaymentService {
      @narrated("Charging {card}")
      @traced("card")
      charge(card: Card): string {
        return `ok-${card.last4}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new PaymentService(), ctx);
    svc.charge(new Card("4111", "123"));
    const node = ctx.captureTrace().roots[0];

    expect(node?.signature.narration).toContain("[REDACTED]");
    expect(node?.signature.narration).not.toContain("123");
    expect(node?.signature.narration).toContain("4111");
  });

  test("adds narration text to trace", () => {
    class OrderService {
      @narrated("Places a new order for the customer")
      @traced("orderId")
      placeOrder(orderId: string): string {
        return `order-${orderId}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new OrderService(), ctx);
    svc.placeOrder("abc");
    const node = ctx.captureTrace().roots[0];
    expect(node?.signature.narration).toBe("Places a new order for the customer");
  });

  test("bare @onError is a catch-all whose context resolves at throw time", () => {
    class PaymentService {
      @onError("Payment processing failed for the customer")
      charge(): never {
        throw new Error("insufficient funds");
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new PaymentService(), ctx);
    expect(() => svc.charge()).toThrow("insufficient funds");
    const outcome = ctx.captureTrace().roots[0]?.outcome;
    expect(outcome?.kind).toBe("threw");
    expect(outcome?.kind === "threw" && outcome.errorContext).toBe(
      "Payment processing failed for the customer",
    );
  });

  test("@narrated and @onError on the same method", () => {
    class InventoryService {
      @narrated("Reserves stock for an item")
      @onError("Stock reservation failed")
      @traced("productId", "quantity")
      reserve(productId: string, _quantity: number): string {
        return `reserved-${productId}`;
      }
    }

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new InventoryService(), ctx);
    svc.reserve("sku-1", 3);
    const node = ctx.captureTrace().roots[0];
    expect(node?.signature.narration).toBe("Reserves stock for an item");
    // normal return → no error context resolved
    expect(node?.outcome.kind).toBe("returned");
    expect(node?.signature.parameters[0]?.name).toBe("productId");
  });
});

class NotFoundError extends Error {}
class ValidationError extends Error {}

describe("@onError exception types", () => {
  function errorContextOf(ctx: SyncNarrativeContext): string | null | undefined {
    const outcome = ctx.captureTrace().roots[0]?.outcome;
    return outcome?.kind === "threw" ? outcome.errorContext : undefined;
  }

  test("renders the context of the @onError matching the thrown type", () => {
    class Repo {
      @onError(NotFoundError, "no such {id}")
      @onError(ValidationError, "bad input")
      @traced("id")
      find(id: string): string {
        throw new NotFoundError(id);
      }
    }
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    expect(() => traceObject(new Repo(), ctx).find("42")).toThrow(NotFoundError);
    expect(errorContextOf(ctx)).toBe("no such 42");
  });

  test("most-specific subclass wins over a broader @onError", () => {
    class SpecificError extends ValidationError {}
    class Repo {
      @onError(ValidationError, "broad")
      @onError(SpecificError, "narrow")
      go(): string {
        throw new SpecificError("x");
      }
    }
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    expect(() => traceObject(new Repo(), ctx).go()).toThrow();
    expect(errorContextOf(ctx)).toBe("narrow");
  });

  test("a thrown type matching no @onError yields no error context", () => {
    class Repo {
      @onError(NotFoundError, "no such thing")
      go(): string {
        throw new ValidationError("x");
      }
    }
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    expect(() => traceObject(new Repo(), ctx).go()).toThrow();
    expect(errorContextOf(ctx)).toBeNull();
  });

  test("a redacted param in the error context resolves to the marker", () => {
    class Repo {
      @onError(NotFoundError, "failed for {secret}")
      @notTraced(0)
      @traced("secret")
      go(secret: string): string {
        throw new NotFoundError("x");
      }
    }
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    expect(() => traceObject(new Repo(), ctx).go("hunter2")).toThrow();
    expect(errorContextOf(ctx)).toBe("failed for [REDACTED]");
  });
});
