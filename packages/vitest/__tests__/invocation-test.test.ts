// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { eachRowArgs, interpolateEachName, normalizeEachCases } from "../src/invocation-test.js";

describe("interpolateEachName", () => {
  it("interpolates %s positionally into a tuple row", () => {
    expect(interpolateEachName("finds %s", ["TENT"], 1)).toBe("finds TENT");
  });

  it("interpolates multiple positional placeholders in order", () => {
    expect(interpolateEachName("%s + %s = %s", [1, 2, 3], 1)).toBe("1 + 2 = 3");
  });

  it("interpolates %# as the 1-based invocation index", () => {
    expect(interpolateEachName("case %#", ["x"], 3)).toBe("case 3");
  });

  it("JSON-stringifies %j/%o for non-string values", () => {
    expect(interpolateEachName("row %j", [{ a: 1 }], 1)).toBe('row {"a":1}');
  });

  it("interpolates $key from a named-fields row", () => {
    expect(
      interpolateEachName("computes $total for $customer", { total: 5, customer: "Ana" }, 1),
    ).toBe("computes 5 for Ana");
  });

  it("leaves an unknown $key placeholder untouched", () => {
    expect(interpolateEachName("uses $missing", { present: 1 }, 1)).toBe("uses $missing");
  });

  it("leaves an unfillable %s untouched with a marker when the tuple runs out", () => {
    expect(interpolateEachName("%s and %s", ["only"], 1)).toBe("only and %!");
  });
});

describe("eachRowArgs", () => {
  it("spreads a tuple row into positional arguments", () => {
    expect(eachRowArgs([1, "two", true])).toEqual([1, "two", true]);
  });

  it("wraps a named-fields row as a single argument", () => {
    const row = { a: 1 };
    expect(eachRowArgs(row)).toEqual([row]);
  });
});

describe("normalizeEachCases", () => {
  it("passes array/object rows through unchanged", () => {
    const cases = [[1], { a: 2 }];
    expect(normalizeEachCases(cases)).toEqual([[1], { a: 2 }]);
  });

  it("wraps a bare scalar row as its own single-element tuple", () => {
    expect(normalizeEachCases(["TENT", "KAYAK"])).toEqual([["TENT"], ["KAYAK"]]);
  });

  it("rejects a non-array (e.g. a tagged-template table result) with a TypeError", () => {
    expect(() => normalizeEachCases("a | b\n1 | 2")).toThrow(TypeError);
    expect(() => normalizeEachCases(undefined)).toThrow(/tagged-template/);
  });
});
