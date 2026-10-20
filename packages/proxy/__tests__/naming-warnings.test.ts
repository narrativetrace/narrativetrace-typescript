// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";

type ProxyModule = typeof import("../src/index.js");

// The warnings are once-per-process, so every test imports a fresh copy of the proxy module.
async function freshProxy(): Promise<ProxyModule> {
  vi.resetModules();
  return import("../src/index.js");
}

function newContext(): SyncNarrativeContext {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
}

class CheckoutService {
  checkout(order: string): string {
    return `done ${order}`;
  }
  ping(): string {
    return "pong";
  }
}

describe("traceObject naming warnings", () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  const warnings = (pattern: RegExp): string[] =>
    warn.mock.calls.map((c) => String(c[0])).filter((m) => pattern.test(m));

  test("an object literal with no className warns that spans will read Object.<method>", async () => {
    const { traceObject } = await freshProxy();
    traceObject({ ping: () => "pong" }, newContext());
    expect(warnings(/Object\.<method>/)).toHaveLength(1);
    expect(warnings(/className/)).toHaveLength(1);
  });

  test("the className warning fires once per process, not once per traced object", async () => {
    const { traceObject } = await freshProxy();
    traceObject({ ping: () => "pong" }, newContext());
    traceObject({ pong: () => "ping" }, newContext());
    expect(warnings(/Object\.<method>/)).toHaveLength(1);
  });

  test("a className override silences the className warning", async () => {
    const { traceObject } = await freshProxy();
    traceObject({ ping: () => "pong" }, newContext(), { className: "PingService" });
    expect(warnings(/Object\.<method>/)).toHaveLength(0);
  });

  test("a class instance does not warn about the class name", async () => {
    const { traceObject } = await freshProxy();
    traceObject(new CheckoutService(), newContext());
    expect(warnings(/Object\.<method>/)).toHaveLength(0);
  });

  test("a method with parameters and no names warns once, naming the method", async () => {
    const { traceObject } = await freshProxy();
    const traced = traceObject(new CheckoutService(), newContext());
    traced.checkout("A");
    traced.checkout("B");
    const found = warnings(/arg0/);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("CheckoutService.checkout");
  });

  test("explicit parameter names silence the parameter-name warning", async () => {
    const { traceObject } = await freshProxy();
    const traced = traceObject(new CheckoutService(), newContext(), {
      methods: { checkout: { params: ["order"] } },
    });
    traced.checkout("A");
    expect(warnings(/arg0/)).toHaveLength(0);
  });

  test("a method without parameters never triggers the parameter-name warning", async () => {
    const { traceObject } = await freshProxy();
    traceObject(new CheckoutService(), newContext()).ping();
    expect(warnings(/arg0/)).toHaveLength(0);
  });

  test("the two conditions warn independently on one literal", async () => {
    const { traceObject } = await freshProxy();
    traceObject({ pay: (amount: number) => amount }, newContext()).pay(3);
    expect(warnings(/Object\.<method>/)).toHaveLength(1);
    expect(warnings(/arg0/)).toHaveLength(1);
  });

  test("a traced call with tracing off warns about nothing it did not record", async () => {
    const { traceObject } = await freshProxy();
    const off = new SyncNarrativeContext(new NarrativeTraceConfig("off"));
    traceObject(new CheckoutService(), off).checkout("A");
    expect(warnings(/arg0/)).toHaveLength(0);
  });
});
