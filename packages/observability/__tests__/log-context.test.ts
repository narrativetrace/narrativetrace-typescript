// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, describe, expect, it } from "vitest";
import { LogContext } from "../src/log-context.js";

describe("LogContext", () => {
  afterEach(() => LogContext.reset());
  it("has no context values by default", () => {
    expect(LogContext.get("missing")).toBeUndefined();
  });

  it("stores and retrieves a value by key", () => {
    LogContext.set("code.namespace", "OrderService");
    expect(LogContext.get("code.namespace")).toBe("OrderService");
  });

  it("returns all context values as a record", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.set("code.function", "placeOrder");
    LogContext.set("nt.depth", 1);
    expect(LogContext.getAll()).toEqual({
      "code.namespace": "OrderService",
      "code.function": "placeOrder",
      "nt.depth": 1,
    });
  });

  it("removes a single key without affecting others", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.set("code.function", "placeOrder");
    LogContext.remove("code.namespace");
    expect(LogContext.get("code.namespace")).toBeUndefined();
    expect(LogContext.get("code.function")).toBe("placeOrder");
  });

  it("clears all context values", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.set("nt.depth", 3);
    LogContext.clear();
    expect(LogContext.getAll()).toEqual({});
  });

  it("run inherits parent values in child scope", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.run({ "code.function": "placeOrder" }, () => {
      expect(LogContext.get("code.namespace")).toBe("OrderService");
      expect(LogContext.get("code.function")).toBe("placeOrder");
    });
  });

  it("child scope modifications do not leak to parent", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.run({ "code.function": "placeOrder" }, () => {
      LogContext.set("nt.depth", 5);
    });
    expect(LogContext.get("nt.depth")).toBeUndefined();
    expect(LogContext.get("code.namespace")).toBe("OrderService");
  });

  it("reset destroys the store so getStore returns undefined", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.reset();
    expect(LogContext.get("code.namespace")).toBeUndefined();
    expect(LogContext.getAll()).toEqual({});
  });

  it("concurrent async scopes see their own values", async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const seen: string[] = [];

    const task1 = LogContext.run({ "code.namespace": "A" }, async () => {
      await delay(10);
      seen.push(`task1:${LogContext.get("code.namespace")}`);
    });

    const task2 = LogContext.run({ "code.namespace": "B" }, async () => {
      await delay(5);
      seen.push(`task2:${LogContext.get("code.namespace")}`);
    });

    await Promise.all([task1, task2]);
    expect(seen).toContain("task1:A");
    expect(seen).toContain("task2:B");
  });
});
