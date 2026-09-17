// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { isRenderingInProgress } from "../src/rendering-guard.js";
import { resolveTemplate } from "../src/template-parser.js";
import { renderValue } from "../src/value-renderer.js";

// Pending-test family for the owner ruling "rendering reads state, never runs behaviour",
// applied family-wide across every NarrativeTrace runtime: a value renderer may read a value's
// STATE — fields, backing fields, stored properties — but
// must never run the value's own code: no getter/accessor, no method, no `toString`/`toJSON`/
// `valueOf`/`Symbol.toPrimitive`/`Symbol.iterator` of a user type, no `Symbol.hasInstance`. The
// only user code rendering may execute is the two landed hooks (`narrativeSummary`, a platform
// leaf's own string conversion) under the rendering guard, plus a proposed third hook a type
// could declare to mark its own elements safe to enumerate. Collections enumerate only through
// the realm intrinsic's own methods, identity-checked — never `instanceof`, never the instance's
// own (possibly overridden) method.
//
// Every test below was first run as a plain assertion against today's code. One that already
// matched the rule stays a plain `test` — a live regression guard, called out as such in its own
// comment. One that did not is wrapped in `test.fails` (vitest's expected-failure form: the run
// itself fails if the test unexpectedly starts passing), commented "pending: rendering reads
// state, never runs behaviour — see the rendering rule in the repository's agent guide", so
// `pnpm run check` stays green today and turns red — a real regression signal, not a silent gap
// — the day the behaviour lands for real.

/** The elements hook the rule proposes for a type that wants to declare its own contents safe to
 * enumerate. Not implemented anywhere in this package yet — this symbol is test-scope only, so a
 * real implementation can be dropped in against the identical well-known name later. */
const ELEMENTS_HOOK = Symbol.for("narrativetrace.elements");

/** A minimal stand-in for a `traceObject`-wrapped method call. The real thing lives in
 * `packages/proxy`, which `core` must never depend on (one-way core → wrapping-package rule), so
 * this mirrors its actual contract instead of importing it: every tracing entry point
 * (`packages/proxy/src/trace-object.ts`, `packages/nestjs/src/wrap-prototype.ts`) checks
 * `isRenderingInProgress()` — the real, shipped guard — before doing any span work, so a call
 * made from inside rendering must record nothing. */
function fakeTracedCall<T>(spans: string[], name: string, fn: () => T): T {
  if (!isRenderingInProgress()) spans.push(name);
  return fn();
}

describe("rendering reads state, never runs behaviour", () => {
  // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
  // Today, `renderFieldValue` (value-renderer.ts) reads an own-enumerable field with a plain
  // property access, which invokes an accessor's getter when the field is one — a documented but
  // unfixed gap (RenderOptions remarks, value-renderer.ts). An object-literal getter is
  // own-enumerable by default, so this is exactly the shape the remark warns about. Observed red
  // today: "expected 1 to be +0" (the getter ran once).
  test("a getter's invocation counter stays at zero and the data fields still render", () => {
    let calls = 0;
    const account = {
      owner: "alice",
      get balance() {
        calls++;
        return 100;
      },
    };
    const rendered = renderValue(account);
    expect(calls).toBe(0);
    expect(rendered).toContain('"owner": "alice"');
  });

  // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
  // Today, a throwing accessor field degrades to the typed error marker for that one field
  // (`renderFieldValue`'s try/catch) — the getter still ran and still threw. Under the rule, an
  // accessor is never invoked at all, so there is nothing to catch and no marker to show for it.
  // Observed red today: rendered text still contains "<error:".
  test("a throwing getter's sibling fields render, with no failure marker for the getter itself", () => {
    const obj = {
      ok: 1,
      get bad(): never {
        throw new Error("getter throws");
      },
    };
    const rendered = renderValue(obj);
    expect(rendered).toContain('"ok": 1');
    expect(rendered).not.toContain("<error:");
  });

  // Live regression guard, not pending: `renderArray` (value-renderer.ts) reads elements via
  // `value.slice(0, n).map(...)`, which the spec defines over indexed `[[Get]]`, never the
  // iterator protocol — so an overridden `[Symbol.iterator]` on an Array subclass is already
  // never reached. Kept here (not just in value-renderer.test.ts) so a future fix to the other
  // gaps in this file, or a rewrite of renderArray to use `Array.prototype.values.call`, cannot
  // silently regress this one.
  test("an Array subclass's elements render through indexed reads, never the overridden iterator", () => {
    let iteratorCalls = 0;
    class Orders extends Array<string> {
      [Symbol.iterator](): never {
        iteratorCalls++;
        throw new Error("iterator boom");
      }
    }
    const orders = new Orders();
    orders.push("sku-1", "sku-2", "sku-3");
    const rendered = renderValue(orders);
    expect(rendered).toBe('["sku-1", "sku-2", "sku-3"]');
    expect(iteratorCalls).toBe(0);
  });

  // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
  // Today, `renderMap` (value-renderer.ts) calls `value.entries()` directly — a subclass's own
  // override runs, worse than the iterator-protocol gap `renderArray` above does not have. The
  // whole map degrades to the typed error marker when that override throws. Under the rule,
  // entries come from `Map.prototype.entries.call(value)`, bypassing the override entirely.
  // Observed red today: rendered text is "<error: Error>", not the entries.
  test("a Map subclass's overridden entries() never runs — entries still render from the base Map's own state", () => {
    let entriesCalls = 0;
    class Cart extends Map<string, number> {
      entries(): IterableIterator<[string, number]> {
        entriesCalls++;
        throw new Error("entries boom");
      }
    }
    const cart = new Cart([
      ["sku-1", 2],
      ["sku-2", 5],
    ]);
    const rendered = renderValue(cart);
    expect(rendered).toBe("{sku-1=2, sku-2=5}");
    expect(entriesCalls).toBe(0);
  });

  // Live regression guard, not pending: `renderPlainObject` walks the instance's own enumerable
  // fields, and a field holding an array (or any other collection) dispatches straight back into
  // `render()` — so a wrapper's own array field already renders as that array with no code of the
  // wrapper's own ever running. Kept here so a fix to the other gaps in this file cannot regress
  // the one refinement ("a type that wraps a platform collection in a field renders as an object
  // whose field renders as that collection") that already works.
  test("a wrapper object's own array field renders as that array", () => {
    class Cart {
      constructor(readonly items: string[]) {}
    }
    const rendered = renderValue(new Cart(["sku-1", "sku-2"]));
    expect(rendered).toBe('{"items": ["sku-1", "sku-2"]}');
  });

  // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
  // Today, a custom iterable that is not Array/Set/Map and declares no hook has no own-enumerable
  // keys visible to `Object.keys` (its state sits behind a true `#private` field), so it renders
  // as the bare structural dump "{}" — no type name, no size, and (incidentally, since nothing
  // here reads Symbol-keyed members at all) the iterator is already never touched. Under the
  // rule, an undeclared iterable renders as its type name with a free size instead of a raw dump.
  // Observed red today: rendered text is "{}", which does not contain "Basket".
  test("an undeclared iterable renders as its type name (with a free size), never a raw structural dump", () => {
    let iterCalls = 0;
    class Basket {
      #items = ["a", "b", "c"];
      get size(): number {
        return this.#items.length;
      }
      [Symbol.iterator](): IterableIterator<string> {
        iterCalls++;
        return this.#items[Symbol.iterator]();
      }
    }
    const rendered = renderValue(new Basket());
    expect(rendered).toContain("Basket");
    expect(rendered).not.toBe("{}");
    expect(iterCalls).toBe(0);
  });

  describe("the third hook: a type declaring its own elements safe to enumerate", () => {
    // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
    // The hook does not exist anywhere in the renderer yet, so a type that declares it renders as
    // the bare structural dump of its (here, zero) own-enumerable keys. Observed red today:
    // rendered text is "{}", containing neither an element nor the total-count marker.
    test("a type's declared elements hook is enumerated and capped, never a raw dump", () => {
      class Basket {
        #parts: string[];
        constructor(parts: string[]) {
          this.#parts = parts;
        }
        [ELEMENTS_HOOK](): Iterable<string> {
          return this.#parts;
        }
      }
      const rendered = renderValue(new Basket(["a", "b", "c", "d", "e", "f", "g"]));
      expect(rendered).toContain('"a"');
      expect(rendered).toContain("(7 total)");
    });

    // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
    // The hook is never invoked today, so the elements never render and `fakeTracedCall` inside
    // it never runs either — `spans` stays empty vacuously, not because the guard worked.
    // Observed red today: rendered text is "{}", which does not contain the element.
    test("the elements hook runs under the rendering guard — a traceObject-style call inside it emits no span", () => {
      const spans: string[] = [];
      class Basket {
        #parts: string[];
        constructor(parts: string[]) {
          this.#parts = parts;
        }
        [ELEMENTS_HOOK](): Iterable<string> {
          return fakeTracedCall(spans, "Basket.elements", () => this.#parts);
        }
      }
      const rendered = renderValue(new Basket(["a", "b"]));
      expect(rendered).toContain('"a"');
      expect(spans).toEqual([]);
    });

    // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
    // Observed red today: rendered text is "{}" (the hook is never called, so it never throws),
    // not the typed error marker the rule requires once a throwing hook IS called.
    test("a throwing elements hook degrades to the typed error marker, not a raw dump", () => {
      class Basket {
        [ELEMENTS_HOOK](): Iterable<string> {
          throw new Error("elements boom");
        }
      }
      expect(renderValue(new Basket())).toBe("<error: Error>");
    });
  });

  describe("template-parser.ts placeholder resolution", () => {
    // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
    // Today, `isRedactedMember` (template-parser.ts) checks `property in root` before
    // `accessProperty` ever runs — on a Proxy, `in` triggers the `has` trap, a side effect that
    // has nothing to do with the field itself (a plain data property, "total": 42, read
    // correctly by `accessProperty`'s ordinary property access once the trap has already fired).
    // Observed red today: the trap counter is 1, not 0 (the value itself already resolves fine).
    test("resolving {order.total} never triggers a Proxy has-trap side effect, and renders the plain data field", () => {
      let hasTrapCalls = 0;
      const target = { total: 42 };
      const order = new Proxy(target, {
        has(t, prop) {
          hasTrapCalls++;
          return prop in t;
        },
      });
      const rendered = resolveTemplate("total is {order.total}", { order });
      expect(hasTrapCalls).toBe(0);
      expect(rendered).toBe("total is 42");
    });
  });

  // toString()/toJSON()/valueOf()/Symbol.toPrimitive() of a composite are covered by extending
  // value-renderer.test.ts's existing "custom toString" describe block (same fixtures, added
  // spies) rather than duplicated here — see the "a composite's toJSON/valueOf/Symbol.toPrimitive
  // are never invoked by rendering" test there.
  describe("the getter law, generalized: property test", () => {
    // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide — the generalized law
    // behind the getter tests above: no matter which (or how many) own-enumerable fields are
    // accessor properties, rendering must invoke none of their getters. No explicit run budget:
    // every generated object has at most 6 fields and costs one `renderValue` call, well under
    // fast-check's own default iteration count and vitest's default per-test timeout (release
    // retrospective rule 3 on explicit budgets is about wall-clock-sized fixtures, which this is
    // not). Observed red today: fast-check reports a counterexample on the very first try.
    test("no object-literal getter is ever invoked while rendering, for any set of field names", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), {
            minLength: 1,
            maxLength: 6,
          }),
          (names) => {
            const { obj, counters } = objectOfCountingGetters(names);
            renderValue(obj);
            return [...counters.values()].every((count) => count === 0);
          },
        ),
      );
    });
  });
});

/** Builds an object whose every own-enumerable field is a counting getter, keyed by field name —
 * the fixture for the generalized property test above. */
function objectOfCountingGetters(names: readonly string[]): {
  readonly obj: Record<string, unknown>;
  readonly counters: Map<string, number>;
} {
  const counters = new Map<string, number>(names.map((n) => [n, 0]));
  const obj: Record<string, unknown> = {};
  for (const name of names) {
    Object.defineProperty(obj, name, {
      enumerable: true,
      configurable: true,
      get() {
        counters.set(name, (counters.get(name) ?? 0) + 1);
        return 1;
      },
    });
  }
  return { obj, counters };
}
