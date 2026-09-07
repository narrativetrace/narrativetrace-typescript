// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import { describe, expect, test } from "vitest";
import { AsyncNarrativeContext } from "../src/async-context.js";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class Service {
  private proxy!: Service;
  setProxy(proxy: Service): void {
    this.proxy = proxy;
  }
  async outer(): Promise<string> {
    await delay(5);
    return this.proxy.inner();
  }
  async inner(): Promise<string> {
    return "inner-result";
  }
}

describe("async nesting with ALS", () => {
  test("inner() correctly nests under outer() via ALS + runScoped", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const service = new Service();
    const proxy = traceObject(service, ctx);
    service.setProxy(proxy);

    const tree = await ctx.run(async () => {
      await proxy.outer();
      return ctx.captureTrace();
    });

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.methodName).toBe("outer");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].signature.methodName).toBe("inner");
  });

  test("concurrent async methods remain siblings, not falsely nested", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

    class ConcurrentService {
      async fast(): Promise<string> {
        await delay(5);
        return "fast";
      }
      async slow(): Promise<string> {
        await delay(10);
        return "slow";
      }
    }

    const proxy = traceObject(new ConcurrentService(), ctx);

    const tree = await ctx.run(async () => {
      await Promise.all([proxy.fast(), proxy.slow()]);
      return ctx.captureTrace();
    });

    expect(tree.roots).toHaveLength(2);
    expect(tree.roots.map((r) => r.signature.methodName).sort()).toEqual(["fast", "slow"]);
    for (const root of tree.roots) {
      expect(root.children).toHaveLength(0);
    }
  });
});
