// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { RedactionPolicy } from "../src/redaction-policy.js";
import { renderValue } from "../src/value-renderer.js";

describe("renderValue", () => {
  describe("happy path", () => {
    test("null → 'null'", () => {
      expect(renderValue(null)).toBe("null");
    });

    test("undefined → 'undefined'", () => {
      expect(renderValue(undefined)).toBe("undefined");
    });

    test("strings → quoted", () => {
      expect(renderValue("hello")).toBe('"hello"');
    });

    test("numbers → direct", () => {
      expect(renderValue(42)).toBe("42");
      expect(renderValue(3.14)).toBe("3.14");
    });

    test("booleans → direct", () => {
      expect(renderValue(true)).toBe("true");
      expect(renderValue(false)).toBe("false");
    });

    test("small arrays → full", () => {
      expect(renderValue([1, 2, 3])).toBe("[1, 2, 3]");
    });

    test("plain objects → {key: value}", () => {
      expect(renderValue({ name: "Alice", age: 30 })).toBe('{"name": "Alice", "age": 30}');
    });

    test("nested structures", () => {
      expect(renderValue({ items: [1, 2] })).toBe('{"items": [1, 2]}');
    });
  });

  describe("Map and Set", () => {
    test("Map renders key=value entries", () => {
      expect(renderValue(new Map([["a", 1]]))).toBe("{a=1}");
    });

    test("Map renders multiple entries in insertion order", () => {
      const m = new Map<string, unknown>([
        ["name", "alice"],
        ["age", 30],
      ]);
      expect(renderValue(m)).toBe('{name="alice", age=30}');
    });

    test("Map redacts sensitive keys via the policy", () => {
      const m = new Map<string, unknown>([["password", "hunter2"]]);
      expect(renderValue(m)).toBe("{password=[REDACTED]}");
    });

    test("Map over the item cap shows the ellipsis marker", () => {
      const m = new Map(Array.from({ length: 7 }, (_, i) => [`k${i}`, i]));
      expect(renderValue(m, { maxCollectionItems: 2 })).toBe("{k0=0, k1=1, …}");
    });

    test("Set renders its members", () => {
      expect(renderValue(new Set([1, 2, 3]))).toBe("[1, 2, 3]");
    });

    test("Set over the item cap shows the total marker", () => {
      expect(renderValue(new Set([1, 2, 3, 4]), { maxCollectionItems: 2 })).toBe(
        "[1, 2, … (4 total)]",
      );
    });
  });

  describe("narrativeSummary hook", () => {
    test("renders a narrativeSummary() method in preference to field introspection", () => {
      class Order {
        constructor(
          readonly id: string,
          readonly secretField: string,
        ) {}
        narrativeSummary(): string {
          return `Order#${this.id}`;
        }
      }
      expect(renderValue(new Order("42", "x"))).toBe("Order#42");
    });

    test("a throwing narrativeSummary falls back to normal rendering", () => {
      class Broken {
        readonly a = 1;
        narrativeSummary(): string {
          throw new Error("boom");
        }
      }
      expect(renderValue(new Broken())).toBe('{"a": 1}');
    });
  });

  describe("custom toString", () => {
    test("an object with a custom toString renders that string, not a field dump", () => {
      class Money {
        constructor(private readonly cents: number) {}
        toString(): string {
          return `$${(this.cents / 100).toFixed(2)}`;
        }
      }
      expect(renderValue(new Money(1234))).toBe("$12.34");
    });

    test("a plain object without a custom toString still introspects", () => {
      expect(renderValue({ a: 1 })).toBe('{"a": 1}');
    });

    test("toString returning null falls back to <TypeName>", () => {
      class Weird {
        toString(): string {
          return null as unknown as string;
        }
      }
      expect(renderValue(new Weird())).toBe("<Weird>");
    });

    test("a throwing toString falls back to <TypeName>", () => {
      class Rogue {
        toString(): string {
          throw new Error("boom");
        }
      }
      expect(renderValue(new Rogue())).toBe("<Rogue>");
    });

    test("custom toString output is control-sanitized and truncated with the ellipsis", () => {
      class Multi {
        toString(): string {
          return "line1\nline2";
        }
      }
      expect(renderValue(new Multi())).toBe("line1\\nline2");
    });
  });

  describe("string sanitization", () => {
    test("control characters are folded to escapes", () => {
      expect(renderValue("a\nb\tc")).toBe('"a\\nb\\tc"');
    });

    test("over-length strings truncate with a … ellipsis", () => {
      expect(renderValue("abcdef", { maxStringLength: 3 })).toBe('"abc…"');
    });
  });

  describe("redaction (default policy)", () => {
    test("redacts sensitive field values, not the value shape", () => {
      expect(renderValue({ password: "hunter2" })).toBe('{"password": [REDACTED]}');
    });

    test("redacts case-insensitive substring names", () => {
      expect(renderValue({ userPassword: "x", apiToken: "y" })).toBe(
        '{"userPassword": [REDACTED], "apiToken": [REDACTED]}',
      );
    });

    test("leaves benign field values intact", () => {
      expect(renderValue({ username: "alice" })).toBe('{"username": "alice"}');
    });

    test("DISABLED policy renders sensitive values in the clear", () => {
      expect(
        renderValue({ password: "hunter2" }, { redactionPolicy: RedactionPolicy.DISABLED }),
      ).toBe('{"password": "hunter2"}');
    });

    test("a static notTraced class field redacts that property by name", () => {
      class Account {
        static readonly notTraced = ["balance"];
        readonly owner = "alice";
        readonly balance = 999;
      }
      expect(renderValue(new Account())).toBe('{"owner": "alice", "balance": [REDACTED]}');
    });

    test("an explicit notTraced field redacts even under the DISABLED policy", () => {
      class Vault {
        static readonly notTraced = ["contents"];
        readonly contents = "gold";
      }
      expect(renderValue(new Vault(), { redactionPolicy: RedactionPolicy.DISABLED })).toBe(
        '{"contents": [REDACTED]}',
      );
    });
  });

  describe("boundary", () => {
    test("string at exact max → not truncated", () => {
      const s = "x".repeat(200);
      expect(renderValue(s)).toBe(`"${s}"`);
    });

    test("string over max → truncated with …", () => {
      const s = "x".repeat(201);
      expect(renderValue(s)).toBe(`"${"x".repeat(200)}…"`);
    });

    test("array at exact max → not truncated", () => {
      const arr = [1, 2, 3, 4, 5];
      expect(renderValue(arr)).toBe("[1, 2, 3, 4, 5]");
    });

    test("array over max → ... (N total)", () => {
      const arr = [1, 2, 3, 4, 5, 6];
      expect(renderValue(arr)).toBe("[1, 2, 3, 4, 5, ... (6 total)]");
    });

    test("object at exact max keys → not truncated", () => {
      const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      expect(renderValue(obj)).toBe('{"a": 1, "b": 2, "c": 3, "d": 4, "e": 5}');
    });

    test("object over max keys → truncated", () => {
      const obj = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };
      expect(renderValue(obj)).toBe('{"a": 1, "b": 2, "c": 3, "d": 4, "e": 5, ... (6 total)}');
    });
  });

  describe("failure/edge", () => {
    test("getter throws → fallback '<Object>'", () => {
      const obj = {
        get bad(): never {
          throw new Error("getter throws");
        },
      };
      expect(renderValue(obj)).toBe("<Object>");
    });

    test("cycle detection → '<circular>'", () => {
      const a: Record<string, unknown> = {};
      a.self = a;
      expect(renderValue(a)).toBe('{"self": <circular>}');
    });

    // Security fuzz suite finding: the ancestor set used for cycle detection never un-marked a
    // value on the way back out of it, so a value reached twice via two different, non-overlapping
    // paths (a "diamond" — shared, not cyclic) rendered the second occurrence as `<circular>`.
    test("the same value reached via two different paths renders in full both times", () => {
      class Holder {
        constructor(readonly held: unknown) {}
      }
      const shared = new Holder("shared-value");
      const graph = [
        { label: "left", payload: shared },
        { label: "right", payload: shared },
      ];

      const rendered = renderValue(graph);

      expect(rendered).not.toContain("<circular>");
      expect(rendered.match(/"shared-value"/g)).toHaveLength(2);
    });

    test("bigint", () => {
      expect(renderValue(BigInt(9007199254740991))).toBe("9007199254740991n");
    });

    test("function → '<function>'", () => {
      expect(renderValue(() => {})).toBe("<function>");
    });

    test("symbol", () => {
      expect(renderValue(Symbol.for("test"))).toBe("Symbol(test)");
    });

    // A symbol's description is the one JDK-numeric-shaped fast path in this renderer that is
    // fully attacker-controlled — unlike number/bigint/boolean, whose string form can never carry
    // arbitrary text. Cross-port mirror of the Java Number-subclass-toString finding
    // (2026-09-03-number-tostring-bypasses-scalar-sanitizing.md): the analogous TS bypass is a
    // hostile symbol description reaching output unsanitized and untruncated.
    test("a hostile symbol description is control-sanitized and truncated like any other scalar", () => {
      const hostile = Symbol("line1\nline2 ```forged fence```");
      expect(renderValue(hostile)).toBe("Symbol(line1\\nline2 ```forged fence```)");
      expect(renderValue(hostile, { maxStringLength: 5 })).toBe("Symbol(line1…)");
    });

    test("a symbol with no description renders an empty description", () => {
      expect(renderValue(Symbol())).toBe("Symbol()");
    });

    // Security fuzz suite finding: dispatch order preferred a custom toString() over field
    // introspection unconditionally, so a class with a notTraced/deny-listed field ALSO defining
    // its own toString() leaked that field in full — the annotation's whole promise ("redacts
    // independently of the policy") never even got consulted, because renderPlainObject was
    // never reached.
    test("a custom toString does not bypass an explicitly annotated field", () => {
      class Card {
        static readonly notTraced = ["cvv"];
        constructor(
          readonly number: string,
          readonly cvv: string,
        ) {}
        toString() {
          return `Card{number=${this.number}, cvv=${this.cvv}}`;
        }
      }

      const rendered = renderValue(new Card("4111", "secret-cvv"));

      expect(rendered).not.toContain("secret-cvv");
      expect(rendered).toContain("[REDACTED]");
      expect(rendered).toContain("4111");
    });

    test("a custom toString does not bypass a deny-listed field name", () => {
      class Credentials {
        constructor(
          readonly name: string,
          readonly password: string,
        ) {}
        toString() {
          return `Credentials{name=${this.name}, password=${this.password}}`;
        }
      }

      const rendered = renderValue(new Credentials("ada", "hunter2"));

      expect(rendered).not.toContain("hunter2");
      expect(rendered).toContain("[REDACTED]");
    });

    test("a custom toString with nothing to hide still renders unchanged", () => {
      class Money {
        constructor(readonly amount: string) {}
        toString() {
          return `EUR ${this.amount}`;
        }
      }

      expect(renderValue(new Money("10.00"))).toBe("EUR 10.00");
    });

    test("custom options override defaults", () => {
      expect(renderValue("abcdef", { maxStringLength: 3 })).toBe('"abc…"');
      expect(renderValue([1, 2, 3], { maxArrayItems: 2 })).toBe("[1, 2, ... (3 total)]");
      expect(renderValue({ a: 1, b: 2 }, { maxObjectKeys: 1 })).toBe('{"a": 1, ... (2 total)}');
    });
  });

  // Security fuzz suite finding: the cycle guard alone does not bound a walk. A chain never
  // repeats an object, so `<circular>` never trips, and following it recursively without a depth
  // cap risked a `RangeError` raised inside instrumentation — and, because how much stack was
  // free varies run to run, the exact depth it failed at varied too, so the *same* deep chain
  // rendered *different* bytes on two calls. `renderStructured` already had a `maxDepth` option
  // for exactly this; the flat renderer had none.
  describe("depth cap", () => {
    function chain(depth: number): unknown {
      let node: unknown = "leaf";
      for (let i = 0; i < depth; i++) node = { held: node };
      return node;
    }

    test("a 10,000-node chain renders without throwing", () => {
      expect(() => renderValue(chain(10_000))).not.toThrow();
    });

    test("a 10,000-node chain renders identically twice", () => {
      const deep = chain(10_000);
      expect(renderValue(deep)).toBe(renderValue(deep));
    });

    test("a graph exactly at the cap renders whole", () => {
      // 32 nested `{ held: ... }` wrappers around the leaf is depth 32 exactly.
      const atCap = chain(32);
      expect(renderValue(atCap)).not.toContain("<max-depth>");
      expect(renderValue(atCap)).toContain('"leaf"');
    });

    test("one level past the cap renders the marker instead of the leaf", () => {
      const overCap = chain(33);
      expect(renderValue(overCap)).toContain("<max-depth>");
      expect(renderValue(overCap)).not.toContain('"leaf"');
    });

    test("a redacted component below the cap is still redacted", () => {
      class Secret {
        static readonly notTraced = ["secret"];
        constructor(readonly secret = "sentinel-value") {}
      }
      let node: unknown = new Secret();
      for (let i = 0; i < 10; i++) node = { held: node };
      expect(renderValue(node)).toContain("[REDACTED]");
      expect(renderValue(node)).not.toContain("sentinel-value");
    });

    test("a component past the cap is unreachable rather than leaked", () => {
      class Secret {
        static readonly notTraced = ["secret"];
        constructor(readonly secret = "sentinel-value") {}
      }
      let node: unknown = new Secret();
      for (let i = 0; i < 40; i++) node = { held: node };
      expect(renderValue(node)).not.toContain("sentinel-value");
    });
  });

  describe("properties", () => {
    test("never returns empty string", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(fc.integer()),
          ),
          (value) => {
            expect(renderValue(value).length).toBeGreaterThan(0);
          },
        ),
      );
    });

    test("string rendering always wraps in quotes", () => {
      fc.assert(
        fc.property(fc.string(), (value) => {
          const result = renderValue(value);
          expect(result.startsWith('"')).toBe(true);
          expect(result.endsWith('"')).toBe(true);
        }),
      );
    });
  });

  describe("promise and thenable handling", () => {
    test("pending Promise renders as <pending>", () => {
      const pending = new Promise(() => {});
      expect(renderValue(pending)).toBe("<pending>");
    });

    test("resolved value (not Promise) renders normally", () => {
      expect(renderValue(42)).toBe("42");
      expect(renderValue("hello")).toBe('"hello"');
      expect(renderValue({ key: "val" })).toBe('{"key": "val"}');
    });

    test("Promise inside object renders as <pending>", () => {
      const obj = { data: new Promise(() => {}) };
      expect(renderValue(obj)).toBe('{"data": <pending>}');
    });

    test("Promise inside array renders as <pending>", () => {
      const arr = [1, new Promise(() => {}), "done"];
      expect(renderValue(arr)).toBe('[1, <pending>, "done"]');
    });

    test("thenable (non-Promise) renders as <pending>", () => {
      // biome-ignore lint/suspicious/noThenProperty: testing thenable detection
      const thenable = { then: (resolve: (v: number) => void) => resolve(42) };
      expect(renderValue(thenable)).toBe("<pending>");
    });

    test("object with non-function then renders normally", () => {
      // biome-ignore lint/suspicious/noThenProperty: testing non-thenable then property
      const obj = { then: "not a function", value: 42 };
      expect(renderValue(obj)).toBe('{"then": "not a function", "value": 42}');
    });

    // Bug-hunt no-poison contract: thenable detection reads `.then`, which invokes the getter
    // regardless of enumerability — unlike field introspection, which only visits enumerable own
    // keys and so never reaches a class-declared (non-enumerable) getter. A hostile `then` must not
    // escape through this earlier, narrower access path (Java ValueRenderer totality).
    test("a throwing `then` getter degrades instead of propagating", () => {
      class Hostile {
        // biome-ignore lint/suspicious/noThenProperty: testing a hostile then getter
        get then(): never {
          throw new Error("then getter refuses");
        }
      }
      expect(() => renderValue(new Hostile())).not.toThrow();
      expect(renderValue(new Hostile())).toBe("{}");
    });
  });
});
