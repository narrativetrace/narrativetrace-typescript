// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { NARRATIVE_ELEMENTS } from "../src/element-origin.js";
import { RedactionPolicy } from "../src/redaction-policy.js";
import { renderStructured } from "../src/rendered-value.js";
import { isRenderingInProgress } from "../src/rendering-guard.js";
import { renderValue } from "../src/value-renderer.js";

describe("renderStructured", () => {
  test("primitives keep their type", () => {
    expect(renderStructured("hi")).toEqual({ kind: "string", value: "hi" });
    expect(renderStructured(42)).toEqual({ kind: "number", value: 42 });
    expect(renderStructured(true)).toEqual({ kind: "boolean", value: true });
  });

  test("null and undefined become other tokens", () => {
    expect(renderStructured(null)).toEqual({ kind: "other", text: "null" });
    expect(renderStructured(undefined)).toEqual({ kind: "other", text: "undefined" });
  });

  test("bigint, symbol and function fall to other", () => {
    expect(renderStructured(7n)).toEqual({ kind: "other", text: "7n" });
    expect(renderStructured(() => {})).toEqual({ kind: "other", text: "<function>" });
    expect(renderStructured(Symbol.for("s"))).toEqual({ kind: "other", text: "Symbol(s)" });
  });

  // Cross-runtime mirror of the Java Number-subclass-toString finding
  // (2026-09-03-number-tostring-bypasses-scalar-sanitizing.md): a symbol's description is
  // caller-controlled text reaching the "other" catch-all — the structured-path analog of a
  // hostile Number.toString() — so it must be control-sanitized like every other scalar text this
  // path produces, not passed through raw via String(value).
  test("a hostile symbol description is control-sanitized in the structured 'other' text", () => {
    const hostile = Symbol("line1\nline2 ```forged fence```");
    expect(renderStructured(hostile)).toEqual({
      kind: "other",
      text: "Symbol(line1\\nline2 ```forged fence```)",
    });
  });

  test("arrays become a typed list", () => {
    expect(renderStructured([1, 2])).toEqual({
      kind: "list",
      items: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
      ],
    });
  });

  test("objects become typed fields with the constructor name", () => {
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
    }
    expect(renderStructured(new Point(1, 2))).toEqual({
      kind: "object",
      typeName: "Point",
      fields: { x: { kind: "number", value: 1 }, y: { kind: "number", value: 2 } },
    });
  });

  test("redacted field names are marked", () => {
    expect(renderStructured({ password: "hunter2" })).toEqual({
      kind: "object",
      typeName: "Object",
      fields: { password: { kind: "other", text: "[REDACTED]" } },
    });
  });

  test("depth beyond the cap collapses to the type name", () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const root = renderStructured(deep, { maxDepth: 2 });
    // root(0) → a(1) → b(2) collapses
    const a = root.kind === "object" ? root.fields.a : undefined;
    const b = a?.kind === "object" ? a.fields.b : undefined;
    expect(b).toEqual({ kind: "other", text: "Object" });
  });

  test("cycles collapse to <circular>", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const root = renderStructured(a);
    expect(root.kind === "object" && root.fields.self).toEqual({
      kind: "other",
      text: "<circular>",
    });
  });

  test("a Map renders as an object keyed by entries with key redaction", () => {
    const m = new Map<string, unknown>([
      ["token", "abc"],
      ["n", 1],
    ]);
    expect(renderStructured(m, { redactionPolicy: RedactionPolicy.DEFAULT })).toEqual({
      kind: "object",
      typeName: "Map",
      fields: { token: { kind: "other", text: "[REDACTED]" }, n: { kind: "number", value: 1 } },
    });
  });

  // 2026-09-11 family security fix: a Map key can be an object carrying a redacted field, and its
  // rendered LABEL must never come from a raw `String(key)` — that silently calls the key's own
  // toString(), bypassing redaction entirely (the structured-path analog of the flat renderer's
  // `renderMapEntry` fix). The key routes through the same `structured()` dispatch every value
  // does, so its own redacted field is masked in the label too, not just in the (irrelevant, here
  // benign) map value.
  test("a Map key carrying a redacted field is masked in its own rendered label", () => {
    class KeyHolder {
      constructor(readonly password: string) {}
      toString(): string {
        return `Key(${this.password})`;
      }
    }
    const m = new Map<unknown, unknown>([[new KeyHolder("hunter2"), "value"]]);
    const rendered = renderStructured(m);

    expect(JSON.stringify(rendered)).not.toContain("hunter2");
    expect(rendered).toEqual({
      kind: "object",
      typeName: "Map",
      fields: {
        "KeyHolder{password: [REDACTED]}": { kind: "string", value: "value" },
      },
    });
  });

  // Security fuzz suite finding: a throwing own-enumerable accessor escaped renderStructured
  // (no catch around field introspection, unlike renderValue's same-shaped `renderObject`), so
  // "the result ... never throws" (this function's own doc comment) did not hold.
  test("a throwing accessor degrades to the type name instead of propagating", () => {
    class Hostile {
      constructor() {
        Object.defineProperty(this, "detail", {
          enumerable: true,
          get(): string {
            throw new Error("getter refuses");
          },
        });
      }
    }

    expect(() => renderStructured(new Hostile())).not.toThrow();
    expect(renderStructured(new Hostile())).toEqual({ kind: "other", text: "Hostile" });
  });

  // Bug-hunt no-poison contract: thenable detection reads `.then`, which invokes the getter
  // regardless of enumerability — unlike field introspection, which only visits enumerable own
  // keys and so never reaches a class-declared (non-enumerable) getter.
  test("a throwing `then` getter degrades instead of propagating", () => {
    class Hostile {
      // biome-ignore lint/suspicious/noThenProperty: testing a hostile then getter
      get then(): never {
        throw new Error("then getter refuses");
      }
    }
    expect(() => renderStructured(new Hostile())).not.toThrow();
    expect(renderStructured(new Hostile())).toEqual({
      kind: "object",
      typeName: "Hostile",
      fields: {},
    });
  });
});

// Cross-port check for a cross-runtime finding: value rendering must never re-enter tracing.
// renderStructured's own doc comment (rendered-value.ts) claims this path structurally cannot
// reach a traced member — no narrativeSummary() call, no custom toString(), only own-enumerable
// field/getter reads — and so is never wrapped in rendering-guard.ts's guard. These are the
// positive assertions that claim rests on (see also packages/proxy/__tests__/render-reentrancy.test.ts
// and packages/nestjs/__tests__/render-reentrancy.test.ts, which prove the end-to-end "no spurious
// span" property for the flat renderer's own guard through both tracing implementations).
describe("renderStructured never re-enters tracing", () => {
  test("a narrativeSummary() member is never invoked, even though it is an own field's sibling", () => {
    let summaryCalls = 0;
    class Summarized {
      narrativeSummary(): string {
        summaryCalls++;
        return "should never be called";
      }
      readonly sku = "SKU-1";
    }
    renderStructured(new Summarized());
    expect(summaryCalls).toBe(0);
  });

  test("the rendering guard never reports active during a structured render", () => {
    let observedDuringRender: boolean | undefined;
    // An object-literal getter is own-enumerable (unlike a class getter, which lives on the
    // prototype) — the one accessor shape structuredFields' `Object.keys` walk actually visits.
    const probed = {
      get sku(): string {
        observedDuringRender = isRenderingInProgress();
        return "SKU-1";
      },
    };
    renderStructured(probed);
    expect(observedDuringRender).toBe(false);
  });
});

// B-191: the third sanctioned hook (NARRATIVE_ELEMENTS) is part of the one origin decision, so
// the structured path shows a declaring type's elements exactly as the flat path does.
describe("renderStructured honours the declared-elements hook like renderValue does", () => {
  class Basket {
    calls = 0;
    guarded = false;
    readonly parts: unknown[];
    constructor(parts: unknown[]) {
      Object.defineProperty(this, "parts", { value: parts, enumerable: false });
    }
    [NARRATIVE_ELEMENTS](): Iterable<unknown> {
      this.calls++;
      this.guarded = isRenderingInProgress();
      return this.parts;
    }
  }

  test("shows the elements under the cap, not the (empty) own fields", () => {
    const basket = new Basket(["a", "b", "c", "d", "e", "f", "g"]);
    expect(renderStructured(basket)).toEqual({
      kind: "list",
      items: ["a", "b", "c", "d", "e"].map((value) => ({ kind: "string", value })),
    });
  });

  test("honours maxItems", () => {
    const rendered = renderStructured(new Basket(["a", "b", "c"]), { maxItems: 2 });
    expect(rendered).toEqual({
      kind: "list",
      items: ["a", "b"].map((value) => ({ kind: "string", value })),
    });
  });

  test("wins over a platform collection the declaring type also is", () => {
    class DeclaredList extends Array<string> {
      [NARRATIVE_ELEMENTS](): Iterable<string> {
        return ["declared"];
      }
    }
    const list = DeclaredList.from([]);
    list.push("platform");
    expect(renderStructured(list)).toEqual({
      kind: "list",
      items: [{ kind: "string", value: "declared" }],
    });
  });

  test("a map-shaped declaration yields key/value pairs", () => {
    const declared = new Basket([
      ["k0", "v0"],
      ["k1", "v1"],
    ]);
    expect(renderStructured(declared)).toEqual({
      kind: "list",
      items: [
        {
          kind: "list",
          items: [
            { kind: "string", value: "k0" },
            { kind: "string", value: "v0" },
          ],
        },
        {
          kind: "list",
          items: [
            { kind: "string", value: "k1" },
            { kind: "string", value: "v1" },
          ],
        },
      ],
    });
  });

  test("runs the hook once, under the rendering guard, even when reached twice", () => {
    const basket = new Basket(["a"]);
    renderStructured({ first: basket, second: basket });
    expect(basket.calls).toBe(1);
    expect(basket.guarded).toBe(true);
    expect(isRenderingInProgress()).toBe(false);
  });

  test("a throwing hook is the typed error marker, on the root and on a nested field", () => {
    class Refuses {
      [NARRATIVE_ELEMENTS](): Iterable<string> {
        throw new RangeError("the hook refuses");
      }
    }
    expect(renderStructured(new Refuses())).toEqual({ kind: "other", text: "<error: RangeError>" });
    expect(renderStructured({ held: new Refuses() })).toEqual({
      kind: "object",
      typeName: "Object",
      fields: { held: { kind: "other", text: "<error: RangeError>" } },
    });
    expect(renderValue(new Refuses())).toBe("<error: RangeError>");
  });

  test("a hook returning a non-iterable is the error marker too", () => {
    const notIterable = { [NARRATIVE_ELEMENTS]: () => 42 };
    expect(renderStructured(notIterable)).toEqual({ kind: "other", text: "<error: TypeError>" });
  });

  test("elements are redacted by shape like any other nested scalar", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz012345";
    const rendered = JSON.stringify(renderStructured(new Basket([jwt])));
    expect(rendered).not.toContain("eyJhbGci");
  });
});

// B-191: a user subclass of Array / Set / Map is enumerated through the platform ancestor's own
// state on the structured path too; none of the subclass's overrides ever runs.
describe("renderStructured reads a platform collection subclass's own state", () => {
  test("an Array subclass: the override, the species constructor and the views never run", () => {
    let overrides = 0;
    class Hostile extends Array<unknown> {
      constructor(...args: number[]) {
        super(...args);
        overrides++;
      }
      override [Symbol.iterator](): ArrayIterator<unknown> {
        overrides++;
        throw new Error("iterator");
      }
      override values(): ArrayIterator<unknown> {
        overrides++;
        throw new Error("values");
      }
      override entries(): ArrayIterator<[number, unknown]> {
        overrides++;
        throw new Error("entries");
      }
    }
    const list = new Hostile();
    list.push("ancestor-list-element", "second");
    overrides = 0;
    expect(renderStructured(list)).toEqual({
      kind: "list",
      items: [
        { kind: "string", value: "ancestor-list-element" },
        { kind: "string", value: "second" },
      ],
    });
    expect(overrides).toBe(0);
  });

  test("a Set subclass: the override never runs", () => {
    let overrides = 0;
    class Hostile extends Set<string> {
      override [Symbol.iterator](): SetIterator<string> {
        overrides++;
        throw new Error("iterator");
      }
      override values(): SetIterator<string> {
        overrides++;
        throw new Error("values");
      }
    }
    expect(renderStructured(new Hostile(["ancestor-set-element"]))).toEqual({
      kind: "list",
      items: [{ kind: "string", value: "ancestor-set-element" }],
    });
    expect(overrides).toBe(0);
  });

  test("a Map subclass: entries, keys, values and the iterator never run", () => {
    let overrides = 0;
    class Hostile extends Map<string, unknown> {
      override entries(): MapIterator<[string, unknown]> {
        overrides++;
        throw new Error("entries");
      }
      override keys(): MapIterator<string> {
        overrides++;
        throw new Error("keys");
      }
      override values(): MapIterator<unknown> {
        overrides++;
        throw new Error("values");
      }
      override [Symbol.iterator](): MapIterator<[string, unknown]> {
        overrides++;
        throw new Error("iterator");
      }
    }
    const map = new Hostile([["visible", "ancestor-map-value"]]);
    expect(renderStructured(map)).toEqual({
      kind: "object",
      typeName: "Map",
      fields: { visible: { kind: "string", value: "ancestor-map-value" } },
    });
    expect(overrides).toBe(0);
  });

  test("the flat path agrees on all three", () => {
    class L extends Array<unknown> {
      override [Symbol.iterator](): ArrayIterator<unknown> {
        throw new Error("iterator");
      }
    }
    class S extends Set<string> {
      override [Symbol.iterator](): SetIterator<string> {
        throw new Error("iterator");
      }
    }
    class M extends Map<string, string> {
      override [Symbol.iterator](): MapIterator<[string, string]> {
        throw new Error("iterator");
      }
    }
    const list = new L();
    list.push("a");
    expect(renderValue(list)).toBe('["a"]');
    expect(renderValue(new S(["b"]))).toBe('["b"]');
    expect(renderValue(new M([["k", "c"]]))).toBe('{k="c"}');
  });
});
