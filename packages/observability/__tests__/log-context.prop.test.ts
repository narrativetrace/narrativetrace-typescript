// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { afterEach, describe, it } from "vitest";
import { LogContext } from "../src/log-context.js";

describe("LogContext property-based", () => {
  afterEach(() => LogContext.reset());

  it("set/get round-trips any string key with string or number value", () => {
    const contextValue = fc.oneof(fc.string(), fc.integer());
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), contextValue, (key, value) => {
        LogContext.set(key, value);
        return LogContext.get(key) === value;
      }),
    );
  });

  it("run always restores parent state regardless of child mutations", () => {
    const contextValue = fc.oneof(fc.string(), fc.integer());
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        contextValue,
        contextValue,
        (key, parentVal, childVal) => {
          LogContext.set(key, parentVal);
          LogContext.run({}, () => {
            LogContext.set(key, childVal);
          });
          return LogContext.get(key) === parentVal;
        },
      ),
    );
  });

  it("concurrent runs never cross-contaminate", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (valA, valB) => {
        const results: [string | number | undefined, string | number | undefined][] = [];

        const a = LogContext.run({ x: valA }, async () => {
          await new Promise((r) => setTimeout(r, 1));
          results.push(["a", LogContext.get("x")]);
        });

        const b = LogContext.run({ x: valB }, async () => {
          await new Promise((r) => setTimeout(r, 1));
          results.push(["b", LogContext.get("x")]);
        });

        await Promise.all([a, b]);
        for (const [label, seen] of results) {
          if (label === "a" && seen !== valA) return false;
          if (label === "b" && seen !== valB) return false;
        }
        return true;
      }),
    );
  });
});
