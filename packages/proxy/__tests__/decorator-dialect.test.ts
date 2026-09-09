// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { narrated, onError } from "../src/narrated.js";
import { notTraced } from "../src/not-traced.js";
import { traceObject } from "../src/trace-object.js";
import { traced } from "../src/traced.js";

/**
 * The dual-dialect contract, exercised through raw decorator calls: the same decorator import
 * must accept the standard TC39 call shape and the legacy experimentalDecorators call shape,
 * and reject anything else with an error naming the fix. The whole-suite legacy compilation
 * run (vitest.legacy.config.ts) covers real legacy-compiled classes; this file pins the shape
 * detection itself, dialect-independently.
 */

type LegacyDecorator = (
  target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
) => PropertyDescriptor;

function applyLegacy(decorator: unknown, proto: object, key: string): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(proto, key);
  if (!descriptor) throw new Error(`no descriptor for ${key}`);
  const result = (decorator as LegacyDecorator)(proto, key, descriptor);
  Object.defineProperty(proto, key, result);
  return result;
}

function methodContext(name: string): ClassMethodDecoratorContext {
  return { kind: "method", name } as ClassMethodDecoratorContext;
}

describe("legacy experimentalDecorators call shape", () => {
  test("all four decorators accept (target, key, descriptor) and trace end to end", () => {
    class PaymentService {
      charge(_customerId: string, _amount: number, _cardToken: string): string {
        return "TX-1";
      }
    }
    const proto = PaymentService.prototype;
    applyLegacy(traced("customerId", "amount", "cardToken"), proto, "charge");
    applyLegacy(narrated("Charging {amount} to {customerId}"), proto, "charge");
    applyLegacy(onError("Charge failed for {customerId}"), proto, "charge");
    applyLegacy(notTraced(2), proto, "charge");

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new PaymentService(), ctx);
    svc.charge("C1", 25, "tok-secret");

    const root = ctx.captureTrace().roots[0];
    expect(root?.signature.parameters[0]?.name).toBe("customerId");
    expect(root?.signature.parameters[2]?.renderedValue).toBe("[REDACTED]");
    expect(root?.signature.narration).toBe("Charging 25 to C1");
  });

  test("legacy decorator returns the descriptor it was given", () => {
    class Svc {
      op(): void {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(Svc.prototype, "op");
    const result = (traced("x") as unknown as LegacyDecorator)(
      Svc.prototype,
      "op",
      descriptor as PropertyDescriptor,
    );
    expect(result).toBe(descriptor);
  });

  test("typed @onError applied legacy-style resolves by thrown type", () => {
    class FailingService {
      fail(_orderId: string): never {
        throw new RangeError("boom");
      }
    }
    const proto = FailingService.prototype;
    applyLegacy(traced("orderId"), proto, "fail");
    applyLegacy(onError("generic failure for {orderId}"), proto, "fail");
    applyLegacy(onError(RangeError, "range failure for {orderId}"), proto, "fail");

    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const svc = traceObject(new FailingService(), ctx);
    expect(() => svc.fail("O-1")).toThrow(RangeError);
    const outcome = ctx.captureTrace().roots[0]?.outcome;
    expect(outcome?.kind === "threw" && outcome.errorContext).toBe("range failure for O-1");
  });

  test("legacy property decoration (no descriptor) fails naming the fix", () => {
    expect(() => (notTraced(0) as unknown as (t: object, k: string) => void)({}, "field")).toThrow(
      /method decorator.*property or an accessor.*config form/s,
    );
  });

  test("legacy property decoration with a symbol key fails the same way", () => {
    expect(() =>
      (traced("a") as unknown as (t: object, k: symbol) => void)({}, Symbol("field")),
    ).toThrow(/method decorator.*property or an accessor/s);
  });

  test("legacy accessor decoration (descriptor without value) fails naming the fix", () => {
    class WithGetter {
      get total(): number {
        return 1;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(WithGetter.prototype, "total");
    expect(() =>
      (narrated("x") as unknown as LegacyDecorator)(
        WithGetter.prototype,
        "total",
        descriptor as PropertyDescriptor,
      ),
    ).toThrow(/method decorator.*no callable descriptor/s);
  });
});

describe("standard TC39 call shape", () => {
  test("returns the method unchanged and records metadata", () => {
    const method = (_a: string): void => {};
    const result = (traced("a") as (m: unknown, c: ClassMethodDecoratorContext) => unknown)(
      method,
      methodContext("op"),
    );
    expect(result).toBe(method);
  });

  test("a non-method TC39 target (field) fails naming the target kind and the fix", () => {
    const fieldContext = { kind: "field", name: "total" } as unknown as ClassMethodDecoratorContext;
    expect(() =>
      (narrated("x") as (m: unknown, c: ClassMethodDecoratorContext) => unknown)(
        undefined,
        fieldContext,
      ),
    ).toThrow(/method decorator.*applied to a field.*Move it onto a class method/s);
  });

  test("a class decoration fails naming the target kind", () => {
    const classContext = { kind: "class", name: "Svc" } as unknown as ClassMethodDecoratorContext;
    expect(() =>
      (traced("a") as (m: unknown, c: ClassMethodDecoratorContext) => unknown)(
        class {},
        classContext,
      ),
    ).toThrow(/applied to a class/);
  });
});

describe("unsupported call shapes", () => {
  test("a call with no arguments names both dialects and the config form", () => {
    expect(() => (traced("a") as unknown as () => void)()).toThrow(
      /neither the standard TC39 decorator shape.*nor the legacy experimentalDecorators shape.*config form.*decorators-guide/s,
    );
  });

  test("a single-argument call (uncompiled decorator syntax) fails loudly, never a no-op", () => {
    const fn = (): void => {};
    for (const decorator of [traced("a"), narrated("t"), onError("t"), notTraced(0)]) {
      expect(() => (decorator as unknown as (x: unknown) => void)(fn)).toThrow(
        /does not compile decorators/,
      );
    }
  });
});
