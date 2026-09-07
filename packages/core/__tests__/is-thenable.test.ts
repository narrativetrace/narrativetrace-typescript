// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { isThenable } from "../src/is-thenable.js";

describe("isThenable", () => {
  test("null and undefined are not thenable", () => {
    expect(isThenable(null)).toBe(false);
    expect(isThenable(undefined)).toBe(false);
  });

  test("primitives are not thenable", () => {
    expect(isThenable(42)).toBe(false);
    expect(isThenable("then")).toBe(false);
    expect(isThenable(true)).toBe(false);
  });

  test("a Promise is thenable", () => {
    expect(isThenable(Promise.resolve(1))).toBe(true);
  });

  test("a plain object with a callable then is thenable", () => {
    // biome-ignore lint/suspicious/noThenProperty: testing thenable detection
    expect(isThenable({ then: () => {} })).toBe(true);
  });

  test("a non-function then is not thenable", () => {
    // biome-ignore lint/suspicious/noThenProperty: testing non-thenable then property
    expect(isThenable({ then: "nope" })).toBe(false);
  });

  test("a throwing `then` getter is not thenable, and does not throw", () => {
    class Hostile {
      // biome-ignore lint/suspicious/noThenProperty: testing a hostile then getter
      get then(): never {
        throw new Error("then getter refuses");
      }
    }
    expect(() => isThenable(new Hostile())).not.toThrow();
    expect(isThenable(new Hostile())).toBe(false);
  });
});
