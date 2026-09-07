// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ConcurrencyKind } from "../src/concurrency-info.js";
import { concurrencyInfo } from "../src/concurrency-info.js";

describe("concurrencyInfo", () => {
  test("creates frozen object with all fields", () => {
    const info = concurrencyInfo("group-1", "Svc.op", "fork-join");
    expect(info.groupId).toBe("group-1");
    expect(info.taskLabel).toBe("Svc.op");
    expect(info.kind).toBe("fork-join");
    expect(Object.isFrozen(info)).toBe(true);
  });

  test("preserves taskLabel", () => {
    const info = concurrencyInfo("g", "DiscountService.calculateDiscount", "fork-join");
    expect(info.taskLabel).toBe("DiscountService.calculateDiscount");
  });

  test("ConcurrencyKind accepts fork-join and fire-and-forget", () => {
    const kinds: ConcurrencyKind[] = ["fork-join", "fire-and-forget"];
    expect(kinds).toHaveLength(2);
    const fj = concurrencyInfo("g", "t", "fork-join");
    const ff = concurrencyInfo("g", "t", "fire-and-forget");
    expect(fj.kind).toBe("fork-join");
    expect(ff.kind).toBe("fire-and-forget");
  });
});
