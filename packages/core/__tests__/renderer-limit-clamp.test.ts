// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetRenderLimitReports } from "../src/render-limits.js";
import { renderStructured } from "../src/rendered-value.js";
import { renderValue } from "../src/value-renderer.js";

// B-207: a limit is a size, so a negative one is clamped to 0 and said
// once on the warn channel, naming every limit clamped. Unclamped, `slice(0, -1)` silently dropped
// only the LAST item (or character) and left the rest standing.
class Bean {
  a = "one";
  b = "two";
  c = "three";
}

let warnings: string[];

beforeEach(() => {
  resetRenderLimitReports();
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a negative flat-renderer limit is clamped to zero with one diagnostic", () => {
  test.each([
    ["maxStringLength", "a-long-string", { maxStringLength: -1 }, { maxStringLength: 0 }],
    ["maxArrayItems", [1, 2, 3], { maxArrayItems: -1 }, { maxArrayItems: 0 }],
    ["maxObjectKeys", new Bean(), { maxObjectKeys: -1 }, { maxObjectKeys: 0 }],
    [
      "maxCollectionItems",
      new Set([1, 2, 3]),
      { maxCollectionItems: -1 },
      { maxCollectionItems: 0 },
    ],
    [
      "maxCollectionItems",
      new Map([
        [1, 2],
        [3, 4],
      ]),
      { maxCollectionItems: -2 },
      { maxCollectionItems: 0 },
    ],
  ])("%s", (name, value, negative, zero) => {
    const clamped = renderValue(value, negative);
    expect(clamped).toBe(renderValue(value, zero));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(name);
    renderValue(value, negative);
    expect(warnings).toHaveLength(1);
  });
});

describe("a negative structured-renderer limit is clamped to zero with one diagnostic", () => {
  test.each([
    ["maxStringLength", "a-long-string", { maxStringLength: -1 }, { maxStringLength: 0 }],
    ["maxItems", [1, 2, 3], { maxItems: -1 }, { maxItems: 0 }],
    ["maxFields", new Bean(), { maxFields: -1 }, { maxFields: 0 }],
    ["maxDepth", { inner: { deep: 1 } }, { maxDepth: -1 }, { maxDepth: 0 }],
  ])("%s", (name, value, negative, zero) => {
    const clamped = renderStructured(value, negative);
    expect(clamped).toEqual(renderStructured(value, zero));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(name);
    renderStructured(value, negative);
    expect(warnings).toHaveLength(1);
  });
});

test("the diagnostic names every clamped limit and no valid one", () => {
  renderValue("x", { maxStringLength: -3, maxArrayItems: -1, maxObjectKeys: 5 });
  expect(warnings).toEqual([
    "[narrativetrace] renderer limits below zero are clamped to 0: maxStringLength=-3, maxArrayItems=-1",
  ]);
});

test("valid limits, zero included, say nothing", () => {
  renderValue([1, 2, 3], { maxArrayItems: 0, maxStringLength: 10 });
  renderStructured([1, 2, 3], { maxItems: 0, maxDepth: 0 });
  expect(warnings).toEqual([]);
});
