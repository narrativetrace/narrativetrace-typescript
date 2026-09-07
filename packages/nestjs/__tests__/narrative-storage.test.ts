// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { NarrativeStorage } from "../src/narrative-storage.js";

function makeCtx() {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
}

describe("NarrativeStorage", () => {
  test("current() returns undefined outside run", () => {
    const storage = new NarrativeStorage();
    expect(storage.current()).toBeUndefined();
  });

  test("current() returns context inside run", () => {
    const storage = new NarrativeStorage();
    const ctx = makeCtx();
    storage.run(ctx, () => {
      expect(storage.current()).toBe(ctx);
    });
  });

  test("current() returns undefined after run completes", () => {
    const storage = new NarrativeStorage();
    storage.run(makeCtx(), () => {});
    expect(storage.current()).toBeUndefined();
  });

  test("nested runs see innermost context", () => {
    const storage = new NarrativeStorage();
    const outer = makeCtx();
    const inner = makeCtx();
    storage.run(outer, () => {
      storage.run(inner, () => {
        expect(storage.current()).toBe(inner);
      });
      expect(storage.current()).toBe(outer);
    });
  });

  test("concurrent runs are isolated", async () => {
    const storage = new NarrativeStorage();
    const ctx1 = makeCtx();
    const ctx2 = makeCtx();

    const [r1, r2] = await Promise.all([
      new Promise<boolean>((resolve) => {
        storage.run(ctx1, async () => {
          await new Promise((r) => setTimeout(r, 5));
          resolve(storage.current() === ctx1);
        });
      }),
      new Promise<boolean>((resolve) => {
        storage.run(ctx2, async () => {
          await new Promise((r) => setTimeout(r, 5));
          resolve(storage.current() === ctx2);
        });
      }),
    ]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  test("run returns the function result", () => {
    const storage = new NarrativeStorage();
    const result = storage.run(makeCtx(), () => 42);
    expect(result).toBe(42);
  });
});
