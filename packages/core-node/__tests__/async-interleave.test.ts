// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import { describe, expect, test } from "vitest";
import { AsyncNarrativeContext } from "../src/async-context.js";

class Service {
  async fast(): Promise<string> {
    return "fast-result";
  }
  async slow(): Promise<string> {
    await new Promise((r) => setTimeout(r, 20));
    return "slow-result";
  }
}

describe("async interleaving on proxied object", () => {
  test("concurrent async methods on same proxy produce correct trace", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const proxy = traceObject(new Service(), ctx);

    await Promise.all([proxy.fast(), proxy.slow()]);

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(2);

    const names = tree.roots.map((r) => r.signature.methodName);
    const values = tree.roots.map((r) =>
      r.outcome.kind === "returned" ? r.outcome.renderedValue : "ERROR",
    );
    const fastIdx = names.indexOf("fast");
    const slowIdx = names.indexOf("slow");
    expect(fastIdx).toBeGreaterThanOrEqual(0);
    expect(slowIdx).toBeGreaterThanOrEqual(0);
    expect(values[fastIdx]).toBe('"fast-result"');
    expect(values[slowIdx]).toBe('"slow-result"');
  });

  test("reset() in one run scope does not corrupt a concurrent scope's captured events", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const svcA = traceObject(new Service(), ctx, undefined, { className: "SvcA" });
    const svcB = traceObject(new Service(), ctx, undefined, { className: "SvcB" });

    const [aTree, bTree] = await Promise.all([
      ctx.run(async () => {
        await svcA.fast();
        ctx.reset();
        return ctx.captureTrace();
      }),
      ctx.run(async () => {
        // finishes after A has reset — its events must survive A's cleanup
        await svcB.slow();
        return ctx.captureTrace();
      }),
    ]);

    expect(aTree.roots).toHaveLength(0);
    expect(bTree.roots).toHaveLength(1);
    expect(bTree.roots[0]?.signature.className).toBe("SvcB");
  });

  test("many interleaved run scopes each capture only their own events", async () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const N = 20;
    const trees = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        ctx.run(async () => {
          const svc = traceObject(new Service(), ctx, undefined, { className: `Svc${i}` });
          await (i % 2 === 0 ? svc.slow() : svc.fast());
          return ctx.captureTrace();
        }),
      ),
    );

    trees.forEach((tree, i) => {
      expect(tree.roots).toHaveLength(1);
      expect(tree.roots[0]?.signature.className).toBe(`Svc${i}`);
    });
  });
});
