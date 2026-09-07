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
import { AutoProxyExplorer } from "../src/auto-proxy-explorer.js";
import { NarrativeStorage } from "../src/narrative-storage.js";

interface Wrapper {
  metatype: (Function & { prototype?: object }) | undefined;
}

function discoveryOf(providers: Wrapper[]) {
  return { getProviders: () => providers, getControllers: () => [] };
}

function wrapperOf(metatype: Function): Wrapper {
  return { metatype };
}

// Bug-hunt no-poison contract: optional-component discovery/bootstrap failure must
// degrade to no-narration, never fail application startup. Mirrors Java's PipelineBootstrap
// finding, translated to this port's own bootstrap seam — AutoProxyExplorer.onApplicationBootstrap
// wraps every discovered provider/controller in one loop, and one hostile class must not stop the
// rest from being wrapped or throw out of a NestJS lifecycle hook.
describe("AutoProxyExplorer no-poison contract", () => {
  test("a provider whose prototype cannot be wrapped does not stop the others", () => {
    class Hostile {
      op(): string {
        return "hostile";
      }
    }
    // A frozen prototype makes every property non-configurable, so
    // Object.defineProperty inside wrapPrototypeMethods throws a TypeError.
    Object.freeze(Hostile.prototype);

    class Good {
      op(): string {
        return "good";
      }
    }

    const storage = new NarrativeStorage();
    const discovery = discoveryOf([wrapperOf(Hostile), wrapperOf(Good)]);
    const explorer = new AutoProxyExplorer(
      // biome-ignore lint/suspicious/noExplicitAny: a minimal DiscoveryService stand-in
      discovery as any,
      storage,
      {},
    );

    expect(() => explorer.onApplicationBootstrap()).not.toThrow();

    const events: TraceEvent[] = [];
    const pipeline = new DualPathPipeline((e) => events.push(e), new BufferedEventConsumer(64));
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
    const result = storage.run(ctx, () => new Good().op());

    expect(result).toBe("good");
    const enters = events.filter((e) => e.type === "enter");
    expect(enters).toHaveLength(1);
    expect(enters[0]?.type === "enter" && enters[0].signature.className).toBe("Good");
  });
});
