// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { createPerProcessRegistry } from "../src/per-process-registry.js";

describe("createPerProcessRegistry", () => {
  test("records and drains values in insertion order, retaining duplicates", () => {
    const registry = createPerProcessRegistry<string>();
    registry.record("A");
    registry.record("A");
    registry.record("B");

    expect(registry.count()).toBe(3);
    expect(registry.drain()).toStrictEqual(["A", "A", "B"]);
  });

  test("draining empties the registry", () => {
    const registry = createPerProcessRegistry<number>();
    registry.record(1);
    registry.drain();

    expect(registry.count()).toBe(0);
    expect(registry.drain()).toStrictEqual([]);
  });

  test("two registries are independent of each other", () => {
    const a = createPerProcessRegistry<string>();
    const b = createPerProcessRegistry<string>();
    a.record("only in a");

    expect(a.count()).toBe(1);
    expect(b.count()).toBe(0);
  });
});
