// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  cachedTemplateCount,
  findUnresolved,
  isCached,
  resolveTemplate,
} from "../src/template-parser.js";

describe("resolveTemplate — simple placeholders", () => {
  test("substitutes a value unquoted", () => {
    expect(resolveTemplate("Greeting {name}", { name: "Alice" })).toBe("Greeting Alice");
  });

  test("stringifies non-string values", () => {
    expect(resolveTemplate("qty {n}", { n: 42 })).toBe("qty 42");
    expect(resolveTemplate("ok {b}", { b: true })).toBe("ok true");
  });

  test("null or missing value leaves the placeholder literal", () => {
    expect(resolveTemplate("Hi {name}", { name: null })).toBe("Hi {name}");
    expect(resolveTemplate("Hi {name}", {})).toBe("Hi {name}");
  });

  test("preserves literal text around and between placeholders", () => {
    expect(resolveTemplate("a{x}b{y}c", { x: "1", y: "2" })).toBe("a1b2c");
  });

  test("template with no placeholders is returned verbatim", () => {
    expect(resolveTemplate("plain text", {})).toBe("plain text");
  });
});

describe("resolveTemplate — property placeholders", () => {
  test("resolves an own property path", () => {
    expect(resolveTemplate("Order {order.id}", { order: { id: 42 } })).toBe("Order 42");
  });

  test("resolves a getter", () => {
    const order = {
      get id() {
        return "A1";
      },
    };
    expect(resolveTemplate("Order {order.id}", { order })).toBe("Order A1");
  });

  test("null arg leaves the placeholder literal", () => {
    expect(resolveTemplate("Order {order.id}", { order: null })).toBe("Order {order.id}");
  });

  test("missing property leaves the placeholder literal", () => {
    expect(resolveTemplate("Order {order.id}", { order: {} })).toBe("Order {order.id}");
  });

  test("throwing getter leaves the placeholder literal", () => {
    const order = {
      get id(): string {
        throw new Error("boom");
      },
    };
    expect(resolveTemplate("Order {order.id}", { order })).toBe("Order {order.id}");
  });
});

describe("resolveTemplate — redaction wins over a property path that names it", () => {
  test("a deny-listed property name resolves to the marker, verbatim", () => {
    // @Narrated("charging {card.cvv}") used to print the cvv in full — the exact case ruled on.
    const card = { last4: "4111", cvv: "123" };
    expect(resolveTemplate("charging {card.cvv}", { card })).toBe("charging [REDACTED]");
  });

  test("an explicit static notTraced member redacts even when no deny-list pattern matches it", () => {
    class Card {
      static readonly notTraced = ["pan"];
      readonly pan = "4111-1111-1111-1111";
    }
    expect(resolveTemplate("card {card.pan}", { card: new Card() })).toBe("card [REDACTED]");
  });

  test("an unannotated deny-listed property redacts by name alone", () => {
    const user = { name: "alice", password: "hunter2" };
    expect(resolveTemplate("login {user.password}", { user })).toBe("login [REDACTED]");
  });

  test("a benign property is unaffected — only the named rule changes", () => {
    const order = { id: 42, total: 9.5 };
    expect(resolveTemplate("Order {order.id} total {order.total}", { order })).toBe(
      "Order 42 total 9.5",
    );
  });

  test("a property naming no member at all survives literally, typo protected", () => {
    // Nothing can leak here: a path that names nothing resolves to nothing, and the placeholder
    // must still be visible to the unresolved-placeholder warning that exists to catch the typo.
    const customer = { id: 1 };
    expect(resolveTemplate("for {customer.cvv}", { customer })).toBe("for {customer.cvv}");
  });

  test("a multi-level path stays literal, exactly as before — nested resolution is unsupported", () => {
    const order = { card: { cvv: "123" } };
    expect(resolveTemplate("charging {order.card.cvv}", { order })).toBe(
      "charging {order.card.cvv}",
    );
  });

  test("a redacted property on a null root still leaves the placeholder literal", () => {
    expect(resolveTemplate("charging {card.cvv}", { card: null })).toBe("charging {card.cvv}");
  });

  test("DEFAULT redaction applies regardless of which value map supplied the root", () => {
    const account = { balance: 100, ssn: "111-22-3333" };
    expect(resolveTemplate("ssn on file: {account.ssn}", { account })).toBe(
      "ssn on file: [REDACTED]",
    );
  });
});

describe("findUnresolved", () => {
  test("returns placeholder keys left in a resolved string", () => {
    expect(findUnresolved("Hi {name} and {order.id}")).toEqual(["name", "order.id"]);
  });

  test("returns empty for a fully resolved string", () => {
    expect(findUnresolved("Hi Alice")).toEqual([]);
  });
});

describe("a value whose toString() throws", () => {
  class Rogue {
    toString(): string {
      throw new Error("toString exploded");
    }
  }

  test("degrades to the typed error marker instead of throwing", () => {
    // Narration must never break the call it narrates. The marker matches what
    // value-renderer already emits for this hazard (the THROWN value's own type, an Error here —
    // never Rogue's type, and never the exception's message), so capture and narration agree.
    expect(resolveTemplate("Processing {payload}", { payload: new Rogue() })).toBe(
      "Processing <error: Error>",
    );
  });

  test("degrades behind a property placeholder too", () => {
    expect(resolveTemplate("Processing {holder.value}", { holder: { value: new Rogue() } })).toBe(
      "Processing <error: Error>",
    );
  });

  // A class's toString() (prototype method) is a leaf's, so returning null still degrades to the
  // bare type marker (not an error — nothing threw). Deliberately a class, not an object literal:
  // an object literal's own `toString: () => null` property is itself an OWN enumerable key, so
  // that shape is no longer a leaf under the 2026-09-11 dispatch rule and introspects instead
  // (`{"toString": <function>}`) — a different, also-safe path this fixture is not testing.
  test("a toString() returning null degrades to the same marker", () => {
    class NullReturning {
      toString(): string {
        return null as unknown as string;
      }
    }
    expect(resolveTemplate("Processing {payload}", { payload: new NullReturning() })).toBe(
      "Processing <NullReturning>",
    );
  });

  test("a well-behaved value is unaffected", () => {
    expect(resolveTemplate("Processing {payload}", { payload: "C-123" })).toBe("Processing C-123");
  });
});

describe("template rendering of exotic values", () => {
  test("a null-prototype object has no toString and renders structurally rather than throwing", () => {
    // Routed through value-renderer like every other object: no toString to trust, so field
    // introspection runs and finds nothing — "{}", not a thrown error or a bypassed rendering.
    const bare = Object.create(null);
    expect(resolveTemplate("Processing {payload}", { payload: bare })).toBe("Processing {}");
  });

  test("primitives are unaffected by the object path", () => {
    expect(resolveTemplate("n={n} b={b}", { n: 42, b: false })).toBe("n=42 b=false");
  });
});

// Security fuzz suite finding: a whole-object placeholder (no dot — {card}, not {card.cvv})
// called the object's own toString() directly, so a class with a custom toString exposing a
// redacted field leaked it in full, one level up from the property-path case above (which
// already redacted correctly). Mirrors Java's fix: a non-scalar is rendered through the safe
// value renderer first, and that form is used only when it actually carries the marker, so a
// narration that was never leaking keeps the exact bytes it had.
describe("resolveTemplate — a whole-object placeholder cannot bypass redaction", () => {
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

  test("an object whose toString exposes a notTraced field is redacted instead", () => {
    const resolved = resolveTemplate("charging {card}", { card: new Card("4111", "secret-cvv") });

    expect(resolved).not.toContain("secret-cvv");
    expect(resolved).toContain("[REDACTED]");
    expect(resolved).toContain("4111");
  });

  test("an object whose toString exposes a deny-listed field name is redacted instead", () => {
    class Credentials {
      constructor(
        readonly name: string,
        readonly password: string,
      ) {}
      toString() {
        return `Credentials{name=${this.name}, password=${this.password}}`;
      }
    }

    const resolved = resolveTemplate("login {creds}", {
      creds: new Credentials("ada", "hunter2"),
    });

    expect(resolved).not.toContain("hunter2");
    expect(resolved).toContain("[REDACTED]");
  });

  // 2026-09-11 family security fix narrowed this further: an object with own fields is ALWAYS
  // introspected, "nothing to hide" or not — a benign-looking toString() is exactly what let a
  // NESTED object's secret slip past the old own-field-only check (see value-renderer.test.ts's
  // "a toString that interpolates a nested redacted object" for the shape this closes). Only a
  // true leaf (no own enumerable key at all) still keeps its own toString byte for byte.
  test("a leaf with nothing to hide keeps its own toString byte for byte", () => {
    class Money {
      toString() {
        return "EUR 10.00";
      }
    }

    expect(resolveTemplate("total {money}", { money: new Money() })).toBe("total EUR 10.00");
  });

  test("an object with own fields is introspected even when its toString has nothing to hide", () => {
    class Money {
      constructor(readonly amount: string) {}
      toString() {
        return `EUR ${this.amount}`;
      }
    }

    expect(resolveTemplate("total {money}", { money: new Money("10.00") })).toBe(
      'total {"amount": "10.00"}',
    );
  });
});

// Security fuzz suite finding, 2026-09-02 (mirrors Java `TemplateParser`'s identical fix): the
// prior fix above routed a whole-object placeholder through value-renderer's safe rendering, but
// only trusted that rendering when it *contained* the redaction marker — falling back to the
// value's own toString() otherwise. The marker is equally absent when value-renderer never saw the
// whole value: truncated at its field/collection cap or cut at its depth cap. Both are reachable on
// demand and are pinned separately below.
describe("resolveTemplate — a whole-object placeholder cannot bypass redaction via truncation", () => {
  // A redacted 6th field past value-renderer's default 5-key cap: the safe rendering truncates
  // the field away entirely, so it never carries the marker, and a toString()-fallback printed the
  // secret in full before the fix.
  class Wide {
    static readonly notTraced = ["six"];
    constructor(
      readonly one: string,
      readonly two: string,
      readonly three: string,
      readonly four: string,
      readonly five: string,
      readonly six: string,
    ) {}
    toString() {
      return `Wide[one=${this.one}, two=${this.two}, three=${this.three}, four=${this.four}, five=${this.five}, six=${this.six}]`;
    }
  }

  test("a redacted field past the renderer's field cap is not narrated by toString", () => {
    const resolved = resolveTemplate("audit {row}", {
      row: new Wide("1", "2", "3", "4", "5", "topsecret"),
    });

    expect(resolved).not.toContain("topsecret");
  });

  // A redacted leaf below value-renderer's 32-level depth cap. Unlike Java, a plain TS object's
  // own toString() is inert (no auto-generated, cascading representation the way a Java record's
  // is) — the platform gives this shape no route to leak in the first place, before or after the
  // fix, so this pins the invariant rather than reproducing a live pre-fix leak. Kept for corpus
  // parity with Java's `chain` fixture (`hostile-corpus/templates.json`).
  class Link {
    constructor(readonly next: unknown) {}
  }

  test("a redacted leaf below the renderer's depth cap is not narrated by toString", () => {
    let chain: unknown = { secret: "topsecret" };
    for (let i = 0; i < 40; i++) chain = new Link(chain);

    const resolved = resolveTemplate("audit {row}", { row: chain });

    expect(resolved).not.toContain("topsecret");
  });
});

// The third production of the grammar (2026-09-04, family security fix): {card.cvv} and {card}
// were both ruled on above; {password} — a bare key naming a scalar — asked nothing at all and
// printed the value in full, so one line of ordinary decoration out-narrated the policy the trace
// beside it obeyed. Two independent bypasses on one line: the name axis never saw the key, and the
// value axis never saw the bytes.
describe("resolveTemplate — a scalar placeholder obeys both redaction axes", () => {
  test("a scalar placeholder naming a secret is redacted like a field", () => {
    const resolved = resolveTemplate("login {password}", { password: "hunter2" });

    expect(resolved).toBe("login [REDACTED]");
    expect(resolved).not.toContain("hunter2");
  });

  test("a credential-shaped scalar is redacted whatever the placeholder is called", () => {
    // The other axis on the same line: the bytes are a credential, whatever the key is called.
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ.c2lnbmF0dXJl";

    const resolved = resolveTemplate("issued {value}", { value: jwt });

    expect(resolved).toBe("issued [REDACTED]");
    expect(resolved).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  test("a text placeholder cannot forge a line with a raw control character", () => {
    const comment = `ok\n## forged\r${String.fromCodePoint(0)}`;

    const resolved = resolveTemplate("note: {comment}", { comment });

    expect(resolved).not.toContain("\n");
    expect(resolved).toBe("note: ok\\n## forged\\r\\u0000");
  });

  test("a text placeholder is capped the way a captured string is", () => {
    const resolved = resolveTemplate("body {payload}", { payload: "x".repeat(500) });

    expect(resolved).toBe(`body ${"x".repeat(200)}…`);
  });

  test("a boxed String object is redacted by shape too", () => {
    // JS has no subclassable string primitive; the boxed wrapper is the one string-like object a
    // value map can carry, and its bytes are text like any other — it must not slip to the object
    // path, whose toString() trust knows nothing about value shapes.
    const jwt = new String("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ.c2lnbmF0dXJl");

    expect(resolveTemplate("issued {value}", { value: jwt })).toBe("issued [REDACTED]");
  });

  test("a placeholder naming a secret with no value stays literal so the typo warning survives", () => {
    // Nothing resolves, so nothing can leak — and the unresolved warning must still fire.
    expect(resolveTemplate("login {password}", {})).toBe("login {password}");
  });

  test("a scalar placeholder whose key merely contains a secret word is redacted too", () => {
    // The deny-list reads the key exactly as it reads a field name: substring, case-insensitive.
    expect(resolveTemplate("using {apiToken}", { apiToken: "tok-9" })).toBe("using [REDACTED]");
  });

  test("an ordinary scalar placeholder is untouched by either axis", () => {
    expect(resolveTemplate("order {orderId}", { orderId: "ORD-7" })).toBe("order ORD-7");
  });
});

// `resolveTemplate` is exported from the public barrel (packages/core/src/index.ts), so its
// template-string argument is caller-supplied on a public API, not limited in practice to the
// finite set of literal `@narrated`/`@onError` decorator strings a codebase happens to declare.
// A process-lifetime cache keyed by that argument grows without bound under a flood of unique
// templates — the same shape as Java's `TemplateParser` finding (2026-09-02 audit, cross-runtime
// shape F2).
describe("resolveTemplate — the template cache is bounded", () => {
  test("a flood of unique templates does not grow the cache without bound", () => {
    for (let i = 0; i < 100_000; i++) {
      resolveTemplate(`template-${i} {x}`, { x: i });
    }

    expect(cachedTemplateCount()).toBeLessThan(100_000);
  });

  test("a hot template survives a flood of single-use templates around it", () => {
    resolveTemplate("hot {x}", { x: 0 });

    for (let i = 0; i < 5_000; i++) {
      resolveTemplate(`noise-${i} {x}`, { x: i });
      resolveTemplate("hot {x}", { x: i });
    }

    expect(isCached("hot {x}")).toBe(true);
  });
});
