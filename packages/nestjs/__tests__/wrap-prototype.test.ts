// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  SyncNarrativeContext,
  type TraceEvent,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { NarrativeStorage } from "../src/narrative-storage.js";
import { NoAutoProxy } from "../src/no-auto-proxy.decorator.js";
import { wrapPrototypeMethods } from "../src/wrap-prototype.js";

function setup() {
  const events: TraceEvent[] = [];
  const pipeline = new DualPathPipeline((e) => events.push(e), new BufferedEventConsumer(64));
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
  const storage = new NarrativeStorage();
  return { events, ctx, storage };
}

describe("wrapPrototypeMethods", () => {
  test("sync method traced when context active", () => {
    const { events, ctx, storage } = setup();
    class Svc {
      greet(name: string) {
        return `hello ${name}`;
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    const svc = new Svc();
    const result = storage.run(ctx, () => svc.greet("world"));
    expect(result).toBe("hello world");
    const enters = events.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(1);
    if (enters[0]?.type === "enter") {
      expect(enters[0].signature.className).toBe("Svc");
      expect(enters[0].signature.methodName).toBe("greet");
    }
  });

  test("async method traced when context active", async () => {
    const { events, ctx, storage } = setup();
    class Svc {
      async fetch() {
        return "data";
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    const svc = new Svc();
    const result = await storage.run(ctx, () => svc.fetch());
    expect(result).toBe("data");
    expect(events.filter((e) => e.type === "enter")).toHaveLength(1);
    expect(events.filter((e) => e.type === "exit")).toHaveLength(1);
  });

  test("sync method passes through when no context", () => {
    const { storage } = setup();
    class Svc {
      greet() {
        return "hi";
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    expect(new Svc().greet()).toBe("hi");
  });

  test("async method passes through when no context", async () => {
    const { storage } = setup();
    class Svc {
      async fetch() {
        return "data";
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    expect(await new Svc().fetch()).toBe("data");
  });

  test("error in sync method calls exitMethodWithException", () => {
    const { events, ctx, storage } = setup();
    class Svc {
      fail() {
        throw new Error("boom");
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    expect(() => storage.run(ctx, () => new Svc().fail())).toThrow("boom");
    const exits = events.filter((e) => e.type === "exit");
    expect(exits).toHaveLength(1);
    if (exits[0]?.type === "exit") {
      expect(exits[0].outcome.kind).toBe("threw");
    }
  });

  test("error in async method calls exitMethodWithException", async () => {
    const { events, ctx, storage } = setup();
    class Svc {
      async fail() {
        throw new Error("async boom");
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    await expect(storage.run(ctx, () => new Svc().fail())).rejects.toThrow("async boom");
    const exits = events.filter((e) => e.type === "exit");
    expect(exits).toHaveLength(1);
    if (exits[0]?.type === "exit") {
      expect(exits[0].outcome.kind).toBe("threw");
    }
  });

  test("@NoAutoProxy method is skipped", () => {
    const { events, ctx, storage } = setup();
    class Svc {
      @NoAutoProxy()
      health() {
        return "ok";
      }
      work() {
        return "done";
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    storage.run(ctx, () => {
      new Svc().health();
      new Svc().work();
    });
    const enters = events.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(1);
    if (enters[0]?.type === "enter") {
      expect(enters[0].signature.methodName).toBe("work");
    }
  });

  test("constructor is not wrapped", () => {
    const { storage } = setup();
    class Svc {
      constructor() {}
      work() {
        return "ok";
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    expect(() => new Svc()).not.toThrow();
  });

  test("non-function properties are not wrapped", () => {
    const { storage } = setup();
    const proto = {
      value: 42,
      work() {
        return "ok";
      },
    };
    wrapPrototypeMethods(proto, "Obj", storage);
    expect(proto.value).toBe(42);
  });

  test("already-wrapped method is not double-wrapped", () => {
    const { events, ctx, storage } = setup();
    class Svc {
      work() {
        return "ok";
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    storage.run(ctx, () => new Svc().work());
    expect(events.filter((e) => e.type === "enter")).toHaveLength(1);
  });

  test("parameters captured in trace", () => {
    const { events, ctx, storage } = setup();
    class Svc {
      add(a: number, b: number) {
        return a + b;
      }
    }
    wrapPrototypeMethods(Svc.prototype, "Svc", storage);
    storage.run(ctx, () => new Svc().add(3, 4));
    const enter = events.find((e) => e.type === "enter");
    if (enter?.type === "enter") {
      expect(enter.signature.parameters).toHaveLength(2);
      expect(enter.signature.parameters[0]?.name).toBe("arg0");
    }
  });
});

// Bug-hunt no-poison contract (mirrors packages/proxy's trace-object.ts fixes for findings 1, 3,
// 7): wrapPrototypeMethods is a separate, prototype-mutating tracing implementation — NestJS DI
// needs every instance traced without per-instance Proxy wrapping — so it carries its own copy of
// the same entry/exit/thenable logic and needed the same hardening independently.
describe("no-poison contract", () => {
  test("a custom context whose enterMethod throws still runs the business call", () => {
    const { storage } = setup();
    class EnterThrowingContext extends SyncNarrativeContext {
      enterMethod(): never {
        throw new Error("enter recording boom");
      }
    }
    const ctx = new EnterThrowingContext(new NarrativeTraceConfig("detail"));
    class Calculator {
      add(a: number, b: number) {
        return a + b;
      }
    }
    wrapPrototypeMethods(Calculator.prototype, "Calculator", storage);

    const result = storage.run(ctx, () => new Calculator().add(2, 3));

    expect(result).toBe(5);
  });

  test("faulty exit recording does not mask a successful sync return", () => {
    const { storage } = setup();
    class ExitThrowingContext extends SyncNarrativeContext {
      exitMethodWithReturn(): void {
        throw new Error("exit recording boom");
      }
    }
    const ctx = new ExitThrowingContext(new NarrativeTraceConfig("detail"));
    class Calculator {
      add(a: number, b: number) {
        return a + b;
      }
    }
    wrapPrototypeMethods(Calculator.prototype, "Calculator", storage);

    const result = storage.run(ctx, () => new Calculator().add(2, 3));

    expect(result).toBe(5);
  });

  test("a custom thenable whose then() throws on registration still returns the original object", () => {
    const { ctx, storage } = setup();
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
    wrapPrototypeMethods(Service.prototype, "Service", storage);

    const result = storage.run(ctx, () => new Service().fetch());

    expect(result).toBe(hostileResult);
  });
});
