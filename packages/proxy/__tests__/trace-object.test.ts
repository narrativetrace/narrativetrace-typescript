// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, NOOP_CONTEXT, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { narrated, onError } from "../src/narrated.js";
import { notTraced } from "../src/not-traced.js";
import { traceObject } from "../src/trace-object.js";

describe("traceObject fast paths", () => {
  // A class (prototype `toString()`), not an object literal: an object literal's own `toString`
  // is an own-enumerable property, so it is no longer a leaf under the 2026-09-11 dispatch rule
  // (value-renderer.ts) and would never reach toString() at all — these tests spy on whether
  // rendering fires, not on the redaction invariant, so the fixture must stay a genuine leaf.
  function spyArg() {
    const state = { renders: 0 };
    class Spy {
      toString(): string {
        state.renders++;
        return "spied";
      }
    }
    return { state, arg: new Spy() };
  }

  test("an off-level context invokes the target with zero value rendering", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("off"));
    class Svc {
      op(_x: unknown): string {
        return "done";
      }
    }
    const { state, arg } = spyArg();
    const traced = traceObject(new Svc(), ctx);
    expect(traced.op(arg)).toBe("done");
    expect(state.renders).toBe(0);
  });

  test("a summary-level context skips argument value rendering", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("summary"));
    class Svc {
      op(_x: unknown): string {
        return "done";
      }
    }
    const { state, arg } = spyArg();
    traceObject(new Svc(), ctx).op(arg);
    expect(state.renders).toBe(0);
  });

  test("a detail-level context renders argument values", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class Svc {
      op(_x: unknown): string {
        return "done";
      }
    }
    const { state, arg } = spyArg();
    traceObject(new Svc(), ctx).op(arg);
    expect(state.renders).toBe(1);
  });

  test("NOOP_CONTEXT invokes the target without any capture work", () => {
    class Svc {
      op(_x: unknown): string {
        return "done";
      }
    }
    const { state, arg } = spyArg();
    expect(traceObject(new Svc(), NOOP_CONTEXT).op(arg)).toBe("done");
    expect(state.renders).toBe(0);
  });

  test("NOOP_CONTEXT returns the original object itself — no proxy, no per-call cost", () => {
    class Svc {
      op(): string {
        return "done";
      }
    }
    const target = new Svc();
    expect(traceObject(target, NOOP_CONTEXT)).toBe(target);
  });

  test("repeated access returns the same wrapper — no per-call closure allocation", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("off"));
    class Svc {
      op(): string {
        return "done";
      }
    }
    const traced = traceObject(new Svc(), ctx);
    expect(traced.op).toBe(traced.op);
  });

  test("a monkey-patched method is re-wrapped, never served from a stale wrapper", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const service = {
      op(): string {
        return "original";
      },
    };
    const traced = traceObject(service, ctx);
    expect(traced.op()).toBe("original");
    service.op = () => "patched";
    expect(traced.op()).toBe("patched");
  });

  test("a method reference captured while off starts tracing when the level turns on", () => {
    const config = new NarrativeTraceConfig("off");
    const ctx = new SyncNarrativeContext(config);
    class Svc {
      op(): string {
        return "done";
      }
    }
    const traced = traceObject(new Svc(), ctx);
    const captured = traced.op;
    captured.call(traced);
    expect(ctx.captureTrace().roots).toHaveLength(0);
    config.level = "detail";
    captured.call(traced);
    expect(ctx.captureTrace().roots).toHaveLength(1);
  });
});

describe("traceObject", () => {
  test("intercepts method call and records in context", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }

    const calc = new Calculator();
    const traced = traceObject(calc, context);

    const result = traced.add(2, 3);

    expect(result).toBe(5);

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.className).toBe("Calculator");
    expect(tree.roots[0].signature.methodName).toBe("add");
  });

  test("captures parameter names from map", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Greeter {
      greet(name: string, age: number): string {
        return `Hello ${name}, age ${age}`;
      }
    }

    const greeter = new Greeter();
    const traced = traceObject(greeter, context, {
      greet: ["name", "age"],
    });

    traced.greet("Alice", 30);

    const tree = context.captureTrace();
    const params = tree.roots[0].signature.parameters;
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe("name");
    expect(params[0].renderedValue).toBe('"Alice"');
    expect(params[1].name).toBe("age");
    expect(params[1].renderedValue).toBe("30");
  });

  test("falls back to arg0/arg1 when no name map", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }

    const calc = new Calculator();
    const traced = traceObject(calc, context);

    traced.add(10, 20);

    const tree = context.captureTrace();
    const params = tree.roots[0].signature.parameters;
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe("arg0");
    expect(params[1].name).toBe("arg1");
  });

  test("renders return value", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }

    const traced = traceObject(new Calculator(), context);
    traced.add(2, 3);

    const tree = context.captureTrace();
    const outcome = tree.roots[0].outcome;
    expect(outcome.kind).toBe("returned");
    expect(outcome.kind === "returned" && outcome.renderedValue).toBe("5");
  });

  test("captures typed structured forms for params and return", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class Calc {
      add(a: number, b: number): number {
        return a + b;
      }
    }
    const traced = traceObject(new Calc(), ctx, { add: ["a", "b"] });
    traced.add(2, 3);
    const node = ctx.captureTrace().roots[0];
    expect(node?.signature.parameters[0]?.structured).toEqual({ kind: "number", value: 2 });
    expect(node?.outcome.kind === "returned" && node.outcome.structured).toEqual({
      kind: "number",
      value: 5,
    });
  });

  test("records exception and rethrows", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Failer {
      fail(): never {
        throw new Error("boom");
      }
    }

    const traced = traceObject(new Failer(), context);

    expect(() => traced.fail()).toThrow("boom");

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(1);
    const outcome = tree.roots[0].outcome;
    expect(outcome.kind).toBe("threw");
    expect(outcome.kind === "threw" && outcome.error).toBeInstanceOf(Error);
  });

  test("faulty exit recording does not mask a successful sync return", () => {
    const config = new NarrativeTraceConfig("detail");
    class ExitThrowingContext extends SyncNarrativeContext {
      exitMethodWithReturn(): void {
        throw new Error("exit recording boom");
      }
    }
    const context = new ExitThrowingContext(config);

    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }

    const traced = traceObject(new Calculator(), context);
    expect(traced.add(2, 3)).toBe(5);
  });

  test("faulty exit recording does not mask a resolved async value", async () => {
    const config = new NarrativeTraceConfig("detail");
    class ExitThrowingContext extends SyncNarrativeContext {
      exitMethodWithReturn(): void {
        throw new Error("exit recording boom");
      }
    }
    const context = new ExitThrowingContext(config);

    class AsyncService {
      async fetch(url: string): Promise<string> {
        return `response from ${url}`;
      }
    }

    const traced = traceObject(new AsyncService(), context);
    await expect(traced.fetch("/api")).resolves.toBe("response from /api");
  });

  test("faulty exit recording preserves the original async rejection", async () => {
    const config = new NarrativeTraceConfig("detail");
    class BusinessError extends Error {}
    class ExitThrowingContext extends SyncNarrativeContext {
      exitMethodWithException(): void {
        throw new Error("exit recording boom");
      }
    }
    const context = new ExitThrowingContext(config);

    class AsyncService {
      async fail(): Promise<never> {
        throw new BusinessError("business failure");
      }
    }

    const traced = traceObject(new AsyncService(), context);
    await expect(traced.fail()).rejects.toBeInstanceOf(BusinessError);
  });

  test("handles async method (Promise return)", async () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class AsyncService {
      async fetch(url: string): Promise<string> {
        return `response from ${url}`;
      }
    }

    const traced = traceObject(new AsyncService(), context);
    const result = await traced.fetch("/api");

    expect(result).toBe("response from /api");

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(1);
    const outcome = tree.roots[0].outcome;
    expect(outcome.kind).toBe("returned");
    expect(outcome.kind === "returned" && outcome.renderedValue).toBe('"response from /api"');
  });

  test("handles async method rejection", async () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class AsyncService {
      async fail(): Promise<string> {
        throw new Error("async boom");
      }
    }

    const traced = traceObject(new AsyncService(), context);

    await expect(traced.fail()).rejects.toThrow("async boom");

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(1);
    const outcome = tree.roots[0].outcome;
    expect(outcome.kind).toBe("threw");
    expect(outcome.kind === "threw" && outcome.error).toBeInstanceOf(Error);
  });

  test("nested traced calls produce child nodes", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Inner {
      compute(x: number): number {
        return x * 2;
      }
    }

    class Outer {
      constructor(private inner: Inner) {}
      run(x: number): number {
        return this.inner.compute(x) + 1;
      }
    }

    const tracedInner = traceObject(new Inner(), context);
    const tracedOuter = traceObject(new Outer(tracedInner), context);

    const result = tracedOuter.run(5);

    expect(result).toBe(11);

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("run");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.className).toBe("Inner");
    expect(tree.roots[0].children[0].signature.methodName).toBe("compute");
  });

  test("non-function property access passes through", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Config {
      name = "test-config";
      version = 42;
    }

    const traced = traceObject(new Config(), context);

    expect(traced.name).toBe("test-config");
    expect(traced.version).toBe(42);

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(0);
  });

  test("className override via options", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Impl {
      run(): string {
        return "done";
      }
    }

    const traced = traceObject(new Impl(), context, undefined, {
      className: "CustomService",
    });

    traced.run();

    const tree = context.captureTrace();
    expect(tree.roots[0].signature.className).toBe("CustomService");
  });

  test("handles method that returns undefined", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Logger {
      log(_msg: string): void {
        // no return
      }
    }

    const traced = traceObject(new Logger(), context);
    const result = traced.log("hello");

    expect(result).toBeUndefined();

    const tree = context.captureTrace();
    const outcome = tree.roots[0].outcome;
    expect(outcome.kind).toBe("returned");
    // The void-completion contract: a method that returns nothing captures `null`, not the
    // string "undefined". Rendering the absence as a word is what made every renderer hide a
    // return by string-comparing against it, and put "undefined" into exported artifacts.
    expect(outcome.kind === "returned" && outcome.renderedValue).toBeNull();
  });

  test('a method returning the string "undefined" still captures a value', () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));

    class Parser {
      describe(): string {
        return "undefined";
      }
    }

    traceObject(new Parser(), context).describe();

    const outcome = context.captureTrace().roots[0].outcome;
    expect(outcome.kind === "returned" && outcome.renderedValue).toBe('"undefined"');
  });

  test("handles method with no arguments", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Clock {
      now(): number {
        return 12345;
      }
    }

    const traced = traceObject(new Clock(), context);
    const result = traced.now();

    expect(result).toBe(12345);

    const tree = context.captureTrace();
    expect(tree.roots[0].signature.parameters).toHaveLength(0);
  });

  test("proxy is transparent to instanceof checks", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Service {
      run(): string {
        return "ok";
      }
    }

    const svc = new Service();
    const traced = traceObject(svc, context);

    expect(traced instanceof Service).toBe(true);
  });

  test("includeReturnValues false suppresses return rendering", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }

    const traced = traceObject(new Calculator(), context, undefined, {
      includeReturnValues: false,
    });

    const result = traced.add(2, 3);

    expect(result).toBe(5);

    const tree = context.captureTrace();
    const outcome = tree.roots[0].outcome;
    expect(outcome.kind).toBe("returned");
    expect(outcome.kind === "returned" && outcome.renderedValue).toBeNull();
  });

  test("includeReturnValues false suppresses return rendering for async methods", async () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class AsyncService {
      async fetch(url: string): Promise<string> {
        return `response from ${url}`;
      }
    }

    const traced = traceObject(new AsyncService(), context, undefined, {
      includeReturnValues: false,
    });
    const result = await traced.fetch("/api");

    expect(result).toBe("response from /api");

    const tree = context.captureTrace();
    const outcome = tree.roots[0].outcome;
    expect(outcome.kind).toBe("returned");
    expect(outcome.kind === "returned" && outcome.renderedValue).toBeNull();
  });

  test("@notTraced decorator redacts marked parameters", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class AuthService {
      @notTraced(1)
      login(username: string, _password: string): boolean {
        return username === "admin";
      }
    }

    const traced = traceObject(new AuthService(), context, {
      login: ["username", "password"],
    });

    traced.login("admin", "secret123");

    const tree = context.captureTrace();
    const params = tree.roots[0].signature.parameters;
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe("username");
    expect(params[0].renderedValue).toBe('"admin"');
    expect(params[0].redacted).toBe(false);
    expect(params[1].name).toBe("password");
    expect(params[1].renderedValue).toBe("[REDACTED]");
    expect(params[1].redacted).toBe(true);
  });

  test("getter properties are forwarded without wrapping", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    let getterCallCount = 0;

    class Service {
      get status(): string {
        getterCallCount++;
        return "active";
      }

      check(): string {
        return this.status;
      }
    }

    const svc = new Service();
    const traced = traceObject(svc, context);

    // Access getter through proxy — should forward, not wrap
    const status = traced.status;
    expect(status).toBe("active");
    expect(getterCallCount).toBe(1);

    // Getter access should not produce a trace node
    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(0);
  });

  test("getter returning function is not wrapped as traced method", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class Service {
      get handler(): () => string {
        return () => "handled";
      }

      run(): string {
        return "ok";
      }
    }

    const traced = traceObject(new Service(), context);

    // Calling getter-returned function should NOT produce trace
    const fn = traced.handler;
    expect(typeof fn).toBe("function");
    const result = fn();
    expect(result).toBe("handled");

    const tree = context.captureTrace();
    expect(tree.roots).toHaveLength(0);

    // But regular methods should still be traced
    context.reset();
    traced.run();
    const tree2 = context.captureTrace();
    expect(tree2.roots).toHaveLength(1);
    expect(tree2.roots[0].signature.methodName).toBe("run");
  });
});

describe("a rogue toString() must not break the traced call", () => {
  class Rogue {
    toString(): string {
      throw new Error("toString exploded");
    }
  }

  test("a @narrated placeholder over a rogue value still runs the method", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class Svc {
      @narrated("Processing {payload}")
      process(_payload: unknown): string {
        return "ok";
      }
    }
    const traced = traceObject(new Svc(), ctx);

    expect(traced.process(new Rogue())).toBe("ok");
  });

  test("an @onError placeholder over a rogue value does not mask the real error", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const business = new Error("the real failure");
    class Svc {
      @onError("Failed while processing {payload}")
      process(_payload: unknown): string {
        throw business;
      }
    }
    const traced = traceObject(new Svc(), ctx);

    expect(() => traced.process(new Rogue())).toThrow(business);
  });
});

// Bug-hunt no-poison contract, 2026-09-01: mirrors Java findings 1 (entry can never prevent the
// business method from running), 3 (exit can never replace the business outcome) and 7 (async
// wrapper registration is guarded — the original object always wins).
describe("no-poison contract: entry and thenable-exit totality", () => {
  test("a custom NarrativeContext whose enterMethod throws still runs the business call", () => {
    const config = new NarrativeTraceConfig("detail");
    class EnterThrowingContext extends SyncNarrativeContext {
      enterMethod(): never {
        throw new Error("enter recording boom");
      }
    }
    const context = new EnterThrowingContext(config);

    class Calculator {
      add(a: number, b: number): number {
        return a + b;
      }
    }

    const traced = traceObject(new Calculator(), context);
    expect(traced.add(2, 3)).toBe(5);
  });

  test("faulty exit recording preserves the original sync business exception", () => {
    const config = new NarrativeTraceConfig("detail");
    class BusinessError extends Error {}
    class ExitThrowingContext extends SyncNarrativeContext {
      exitMethodWithException(): void {
        throw new Error("exit recording boom");
      }
    }
    const context = new ExitThrowingContext(config);

    class Service {
      fail(): never {
        throw new BusinessError("business failure");
      }
    }

    const traced = traceObject(new Service(), context);
    expect(() => traced.fail()).toThrow(BusinessError);
  });

  test("a custom thenable whose then() throws on registration still returns the original object", () => {
    const config = new NarrativeTraceConfig("detail");
    const context = new SyncNarrativeContext(config);

    class HostileThenable {
      // biome-ignore lint/suspicious/noThenProperty: testing a hostile then() registration
      then(): never {
        throw new Error("then registration boom");
      }
    }
    const hostileResult = new HostileThenable();

    class Service {
      fetch(): HostileThenable {
        return hostileResult;
      }
    }

    const traced = traceObject(new Service(), context);
    expect(traced.fetch()).toBe(hostileResult);
  });
});

// Bug-hunt no-poison contract: ordinary object operations (coercion, inspection) are
// not business calls and must not be traced — Java's mirror is proxy.equals/hashCode/toString;
// JS's is toString/valueOf/Symbol.toPrimitive/util.inspect, since === is already reflexive for a
// Proxy and JS has no user-overridable equals/hashCode to intercept.
describe("no-poison contract: ordinary object operations are never traced", () => {
  class Money {
    constructor(private readonly cents: number) {}
    toString(): string {
      return `$${(this.cents / 100).toFixed(2)}`;
    }
    valueOf(): number {
      return this.cents;
    }
  }

  function tracedMoney(context: SyncNarrativeContext) {
    return traceObject(new Money(1234), context);
  }

  test("String(proxy) delegates to the target's toString without opening a span", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const traced = tracedMoney(context);

    expect(String(traced)).toBe("$12.34");
    expect(context.captureTrace().roots).toHaveLength(0);
  });

  test("numeric coercion delegates to the target's valueOf without opening a span", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const traced = tracedMoney(context);

    expect(traced + 1).toBe(1235);
    expect(context.captureTrace().roots).toHaveLength(0);
  });

  test("template-literal interpolation does not open a span", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const traced = tracedMoney(context);

    expect(`total: ${traced}`).toBe("total: $12.34");
    expect(context.captureTrace().roots).toHaveLength(0);
  });

  test("an object with no custom toString still coerces normally, untraced", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class Plain {
      op(): string {
        return "ok";
      }
    }
    const traced = traceObject(new Plain(), context);

    expect(String(traced)).toBe("[object Object]");
    expect(context.captureTrace().roots).toHaveLength(0);
  });

  test("business methods are still traced alongside untraced coercion", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const traced = tracedMoney(context);

    String(traced);
    expect(traced.toString()).toBe("$12.34");

    expect(context.captureTrace().roots).toHaveLength(0);
  });
});

// Bug-hunt no-poison contract: the supplement found Java poisoned at ERRORS/SUMMARY/
// NARRATIVE too, not only DETAIL — return-value rendering runs at every active level in this runtime
// too (there is no capture gate below DETAIL for returns, only for parameters), so it must be
// total at every one of them. This is a pin, not a fix: earlier findings in the same contract
// already make every rendering/exit path total regardless of level: the full matrix is what proves it.
describe("no-poison contract: hostile values are harmless at every active level", () => {
  class HostileParam {
    toString(): string {
      throw new Error("hostile param toString");
    }
  }
  class HostileReturn {
    toString(): string {
      throw new Error("hostile return toString");
    }
  }

  const levels = ["errors", "summary", "narrative", "detail"] as const;

  test.each(levels)("level=%s: a hostile parameter never blocks the business call", (level) => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig(level));
    class Service {
      handle(_payload: unknown): string {
        return "ok";
      }
    }
    const traced = traceObject(new Service(), context);

    expect(traced.handle(new HostileParam())).toBe("ok");
  });

  test.each(levels)("level=%s: a hostile return value is still returned, not replaced", (level) => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig(level));
    const hostileReturn = new HostileReturn();
    class Service {
      handle(): HostileReturn {
        return hostileReturn;
      }
    }
    const traced = traceObject(new Service(), context);

    expect(traced.handle()).toBe(hostileReturn);
  });

  test.each(
    levels,
  )("level=%s: hostile parameter and hostile return together never block or replace the call", (level) => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig(level));
    const hostileReturn = new HostileReturn();
    class Service {
      handle(_payload: unknown): HostileReturn {
        return hostileReturn;
      }
    }
    const traced = traceObject(new Service(), context);

    expect(traced.handle(new HostileParam())).toBe(hostileReturn);
  });
});
