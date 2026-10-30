// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  declaredElements,
  elementOrigin,
  NARRATIVE_ELEMENTS,
  platformMembers,
} from "../src/element-origin.js";
import { RenderWalk } from "../src/render-walk.js";
import { isRenderingInProgress } from "../src/rendering-guard.js";

// The origin decision both render paths consult (the twin of Java's ElementOrigin): one verdict
// per value, so the flat and the structured path cannot drift apart.
describe("elementOrigin", () => {
  test("a type carrying the NARRATIVE_ELEMENTS method is declared, ahead of every platform check", () => {
    class Basket {
      [NARRATIVE_ELEMENTS](): Iterable<string> {
        return [];
      }
    }
    class DeclaredList extends Array<string> {
      [NARRATIVE_ELEMENTS](): Iterable<string> {
        return [];
      }
    }
    expect(elementOrigin(new Basket())).toBe("declared");
    expect(elementOrigin(new DeclaredList())).toBe("declared");
  });

  test("a hook symbol holding a non-function does not declare", () => {
    expect(elementOrigin({ [NARRATIVE_ELEMENTS]: ["a"] })).toBe("object");
  });

  test("an Array, a Set and a Map, subclasses included, enumerate by platform state", () => {
    class Sub extends Array<string> {}
    class SubSet extends Set<string> {}
    class SubMap extends Map<string, string> {}
    expect(elementOrigin([])).toBe("array");
    expect(elementOrigin(new Sub())).toBe("array");
    expect(elementOrigin(new Set())).toBe("set");
    expect(elementOrigin(new SubSet())).toBe("set");
    expect(elementOrigin(new Map())).toBe("map");
    expect(elementOrigin(new SubMap())).toBe("map");
  });

  test("everything else, a hand-rolled iterable included, is read as object state", () => {
    const iterable = {
      *[Symbol.iterator]() {
        yield 1;
      },
    };
    expect(elementOrigin(iterable)).toBe("object");
    expect(elementOrigin({})).toBe("object");
  });
});

describe("platformMembers", () => {
  test("reads an array subclass by index, never through its iterator or species constructor", () => {
    let overrides = 0;
    class Sub extends Array<string> {
      constructor(...args: number[]) {
        super(...args);
        overrides++;
      }
      override [Symbol.iterator](): ArrayIterator<string> {
        overrides++;
        throw new Error("iterator");
      }
    }
    const sub = Sub.from([]);
    sub.push("a", "b", "c");
    overrides = 0;
    expect(platformMembers(sub, "array", 2)).toEqual({ items: ["a", "b"], total: 3 });
    expect(overrides).toBe(0);
  });

  test("reads a Set and a Map subclass through the platform methods", () => {
    class SubSet extends Set<string> {
      override values(): SetIterator<string> {
        throw new Error("values");
      }
    }
    class SubMap extends Map<string, string> {
      override entries(): MapIterator<[string, string]> {
        throw new Error("entries");
      }
    }
    expect(platformMembers(new SubSet(["a", "b"]), "set", 5)).toEqual({
      items: ["a", "b"],
      total: 2,
    });
    expect(platformMembers(new SubMap([["k", "v"]]), "map", 5)).toEqual({
      items: [["k", "v"]],
      total: 1,
    });
  });
});

describe("declaredElements", () => {
  test("runs the hook once per walk, under the rendering guard, and caches the answer", () => {
    let calls = 0;
    let guarded = false;
    const value = {
      [NARRATIVE_ELEMENTS]() {
        calls++;
        guarded = isRenderingInProgress();
        return new Set(["x", "y"]);
      },
    };
    const walk = new RenderWalk();
    expect(declaredElements(value, walk)).toEqual(["x", "y"]);
    expect(declaredElements(value, walk)).toEqual(["x", "y"]);
    expect(calls).toBe(1);
    expect(guarded).toBe(true);
  });

  test("a throwing hook throws the same failure again from the cache, without a second call", () => {
    let calls = 0;
    const value = {
      [NARRATIVE_ELEMENTS](): never {
        calls++;
        throw new TypeError("refuses");
      },
    };
    const walk = new RenderWalk();
    expect(() => declaredElements(value, walk)).toThrow(TypeError);
    expect(() => declaredElements(value, walk)).toThrow(TypeError);
    expect(calls).toBe(1);
  });
});
