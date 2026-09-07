// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test, vi } from "vitest";
import { PerishableMap } from "../src/perishable-map.js";

describe("PerishableMap", () => {
  test("put and get return the stored value", () => {
    const map = new PerishableMap<string, number>(10, 60_000, vi.fn());
    map.put("a", 1);
    expect(map.get("a")).toBe(1);
  });

  test("remove returns the value and deletes the entry", () => {
    const map = new PerishableMap<string, number>(10, 60_000, vi.fn());
    map.put("a", 1);
    expect(map.remove("a")).toBe(1);
    expect(map.get("a")).toBeUndefined();
    expect(map.size).toBe(0);
  });

  test("remove returns undefined for missing key", () => {
    const map = new PerishableMap<string, number>(10, 60_000, vi.fn());
    expect(map.remove("missing")).toBeUndefined();
  });

  test("get returns undefined for missing key", () => {
    const map = new PerishableMap<string, number>(10, 60_000, vi.fn());
    expect(map.get("missing")).toBeUndefined();
  });

  test("evicts entries that exceed TTL on put", () => {
    let now = 0;
    const evicted: number[] = [];
    const map = new PerishableMap<string, number>(
      10,
      100,
      (v) => evicted.push(v),
      () => now,
    );

    map.put("a", 1);
    now = 101;
    map.put("b", 2);

    expect(evicted).toEqual([1]);
    expect(map.get("a")).toBeUndefined();
    expect(map.get("b")).toBe(2);
  });

  test("evicts oldest entry when capacity is exceeded", () => {
    const evicted: number[] = [];
    const map = new PerishableMap<string, number>(2, 60_000, (v) => evicted.push(v));

    map.put("a", 1);
    map.put("b", 2);
    map.put("c", 3);

    expect(evicted).toEqual([1]);
    expect(map.get("a")).toBeUndefined();
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
    expect(map.size).toBe(2);
  });

  test("overwriting existing key does not trigger eviction", () => {
    const evicted: number[] = [];
    const map = new PerishableMap<string, number>(2, 60_000, (v) => evicted.push(v));

    map.put("a", 1);
    map.put("b", 2);
    map.put("a", 10);

    expect(evicted).toEqual([]);
    expect(map.get("a")).toBe(10);
    expect(map.size).toBe(2);
  });

  test("TTL eviction frees space before capacity eviction", () => {
    let now = 0;
    const evicted: number[] = [];
    const map = new PerishableMap<string, number>(
      2,
      100,
      (v) => evicted.push(v),
      () => now,
    );

    map.put("a", 1);
    now = 50;
    map.put("b", 2);
    now = 150;
    map.put("c", 3);

    expect(evicted).toEqual([1]);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
    expect(map.size).toBe(2);
  });

  test("size reflects current entries", () => {
    const map = new PerishableMap<string, number>(10, 60_000, vi.fn());
    expect(map.size).toBe(0);
    map.put("a", 1);
    map.put("b", 2);
    expect(map.size).toBe(2);
    map.remove("a");
    expect(map.size).toBe(1);
  });
});
