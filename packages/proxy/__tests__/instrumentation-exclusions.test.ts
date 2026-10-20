// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  NarrativeTraceConfig,
  registerExcludeFromEnv,
  resetExclusionReports,
  SyncNarrativeContext,
} from "@narrativetrace/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { traceObject } from "../src/trace-object.js";

function context(): SyncNarrativeContext {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
}

function spanNames(ctx: SyncNarrativeContext): string[] {
  return ctx
    .captureTrace()
    .roots.map((root) => `${root.signature.className}.${root.signature.methodName}`);
}

class Checkout {
  pay(amount: number): number {
    return amount;
  }
}

class Reflector {
  get(key: string): string {
    return key;
  }
}

beforeEach(() => resetExclusionReports());
afterEach(() => {
  registerExcludeFromEnv(undefined);
  vi.restoreAllMocks();
});

describe("traceObject exclude (list 2)", () => {
  test("a target on the shipped default list is returned untouched and not traced", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = context();
    const target = new Reflector();
    const traced = traceObject(target, ctx);
    expect(traced).toBe(target);
    traced.get("k");
    expect(spanNames(ctx)).toEqual([]);
  });

  test("an unlisted class is still traced", () => {
    const ctx = context();
    traceObject(new Checkout(), ctx).pay(1);
    expect(spanNames(ctx)).toEqual(["Checkout.pay"]);
  });

  test("an explicit exclude replaces the default, so the default's members trace again", () => {
    const ctx = context();
    traceObject(new Reflector(), ctx, { exclude: ["Checkout"] }).get("k");
    expect(spanNames(ctx)).toEqual(["Reflector.get"]);
  });

  test("an explicit exclude names what is not traced", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = context();
    traceObject(new Checkout(), ctx, { exclude: ["Checkout"] }).pay(1);
    expect(spanNames(ctx)).toEqual([]);
  });

  test("exclude wins over the className the caller chose to include", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = context();
    const target = { pay: (n: number) => n };
    traceObject(target, ctx, { className: "acme.vendor.Gateway", exclude: ["acme.vendor"] }).pay(1);
    expect(spanNames(ctx)).toEqual([]);
  });

  test("a sibling sharing the prefix is traced: acme.vendor never matches acme.vendorX", () => {
    const ctx = context();
    const target = { pay: (n: number) => n };
    traceObject(target, ctx, { className: "acme.vendorX.Gateway", exclude: ["acme.vendor"] }).pay(
      1,
    );
    expect(spanNames(ctx)).toEqual(["acme.vendorX.Gateway.pay"]);
  });

  test("an empty exclude list excludes nothing, shipped default included", () => {
    const ctx = context();
    traceObject(new Reflector(), ctx, { exclude: [] }).get("k");
    expect(spanNames(ctx)).toEqual(["Reflector.get"]);
  });

  test("NARRATIVETRACE_EXCLUDE replaces the default and an option beats it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerExcludeFromEnv("Checkout");
    const ctx = context();
    traceObject(new Checkout(), ctx).pay(1);
    traceObject(new Reflector(), ctx).get("k");
    traceObject(new Checkout(), ctx, { exclude: [] }).pay(2);
    expect(spanNames(ctx)).toEqual(["Reflector.get", "Checkout.pay"]);
  });

  test("reports each matched prefix once, however many targets it excludes", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = context();
    traceObject(new Reflector(), ctx);
    traceObject(new Reflector(), ctx);
    traceObject(new Checkout(), ctx, { exclude: ["Checkout"] });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("rejects an invalid exclude before doing any work", () => {
    expect(() => traceObject(new Checkout(), context(), { exclude: ["a", "a"] })).toThrow(
      /duplicate/,
    );
    expect(() => traceObject(new Checkout(), context(), { exclude: [""] })).toThrow(RangeError);
  });

  test("exclude alone in the third argument is an option, not a paramNames map", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = context();
    traceObject(new Checkout(), ctx, { exclude: ["Checkout"] }).pay(1);
    expect(spanNames(ctx)).toEqual([]);
  });

  test("a method named exclude keeps its paramNames shorthand", () => {
    const ctx = context();
    const target = { exclude: (item: string) => item };
    traceObject(target, ctx, { exclude: ["item"] }).exclude("x");
    const root = ctx.captureTrace().roots[0];
    expect(root?.signature.parameters.map((p) => p.name)).toEqual(["item"]);
  });
});

describe("traceObject structural skips (list 1)", () => {
  test("a class held as a property is returned as the class itself, so `new` still works", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    class Model {
      constructor(readonly id: number) {}
    }
    const registry = { Model, pay: (n: number) => n };
    const traced = traceObject(registry, context(), { className: "Registry" });
    expect(traced.Model).toBe(Model);
    expect(new traced.Model(7).id).toBe(7);
  });

  test("skipping a class property is reported once, not thrown into the host", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    class A {}
    class B {}
    const traced = traceObject({ A, B }, context(), { className: "Registry" });
    expect(() => [traced.A, traced.B, traced.A]).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("class");
  });

  test("a bound wrapper of an outside function is not traced, silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const lines: string[] = [];
    const ctx = context();
    const target = { emit: (line: string) => lines.push(line), write: lines.push.bind(lines) };
    const traced = traceObject(target, ctx, { className: "Sink" });
    traced.write("x");
    traced.emit("y");
    expect(spanNames(ctx)).toEqual(["Sink.emit"]);
    expect(warn).not.toHaveBeenCalled();
  });

  test("an autobound method stays traced", () => {
    class Handler {
      handle(n: number): number {
        return n;
      }
    }
    const handler = new Handler();
    handler.handle = handler.handle.bind(handler);
    const ctx = context();
    traceObject(handler, ctx).handle(1);
    expect(spanNames(ctx)).toEqual(["Handler.handle"]);
  });

  test("an iterator method is a runtime hook: iterating a traced object records no span", () => {
    class Bag {
      *[Symbol.iterator](): Generator<number> {
        yield 1;
      }
    }
    const ctx = context();
    expect([...traceObject(new Bag(), ctx)]).toEqual([1]);
    expect(spanNames(ctx)).toEqual([]);
  });

  test("toJSON is a runtime hook: serialising a traced object records no span", () => {
    class Money {
      toJSON(): string {
        return "10 EUR";
      }
    }
    const ctx = context();
    expect(JSON.stringify(traceObject(new Money(), ctx))).toBe('"10 EUR"');
    expect(spanNames(ctx)).toEqual([]);
  });
});
