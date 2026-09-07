// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { RedactionPolicy } from "../src/redaction-policy.js";
import { renderStructured } from "../src/rendered-value.js";
import { resolveTemplate } from "../src/template-parser.js";
import { renderValue } from "../src/value-renderer.js";

/**
 * TODO 46 (container-redaction audit). A redacted component must never appear in ANY rendered
 * output, at ANY nesting depth, through ANY of the surfaces that turn a captured value into text:
 * `renderValue` (flat), `renderStructured` (typed tree), and `resolveTemplate` (narration/error
 * templates). One secret, one marker, checked at every depth a container can carry it to.
 *
 * @remarks Java found five stdlib wrapper types (`Optional`, `AtomicReference`, `Future`,
 * `AtomicReferenceArray`, a standalone `Map.Entry`) whose own `toString()` printed a payload's
 * raw fields past its redaction. TypeScript's dispatch order already special-cases every built-in
 * container this renderer recognizes (`Array`, `Set`, `Map`) *before* it ever trusts a custom
 * `toString()`, and the one JS analog of a single-payload wrapper (`Promise`/thenable) never
 * introspects its payload at all — it renders `<pending>` without reading it. No live TS
 * equivalent of the Java holes was found; these tests pin that as a checked invariant rather than
 * an assumption, so a future dispatch-order change that reintroduces one fails loudly here.
 */

const SECRET = "hunter2-topsecret-value";

class Account {
  static readonly notTraced = ["secret"];
  constructor(
    readonly owner: string,
    readonly secret: string,
  ) {}
}

function account(): Account {
  return new Account("alice", SECRET);
}

function assertNoLeak(rendered: string): void {
  expect(rendered).not.toContain(SECRET);
  expect(rendered).toContain("[REDACTED]");
}

describe("a redacted component never appears in rendered output, at any container depth", () => {
  describe("renderValue (flat)", () => {
    test("directly", () => {
      assertNoLeak(renderValue(account()));
    });

    test("one array deep", () => {
      assertNoLeak(renderValue([account()]));
    });

    test("one Set deep", () => {
      assertNoLeak(renderValue(new Set([account()])));
    });

    test("one Map value deep", () => {
      assertNoLeak(renderValue(new Map([["card", account()]])));
    });

    test("one plain-object field deep", () => {
      assertNoLeak(renderValue({ holder: account() }));
    });

    test("stacked: array of a Map of a Set of the redacted value", () => {
      const stacked = [new Map([["k", new Set([account()])]])];
      assertNoLeak(renderValue(stacked));
    });

    test("a self-holding array does not leak the secret while unwinding the cycle", () => {
      const cyclic: unknown[] = [account()];
      cyclic.push(cyclic);
      assertNoLeak(renderValue(cyclic));
    });
  });

  describe("renderStructured (typed tree)", () => {
    function serialized(value: unknown): string {
      // maxDepth wide enough that the stacked case below still reaches the redacted field
      // itself, rather than collapsing to a bare type name at the default depth of 3 — a
      // depth-collapsed object shows neither the secret nor the marker, which is safe but would
      // make the "redaction still applies" half of this test vacuous.
      return JSON.stringify(renderStructured(value, { maxDepth: 6 }));
    }

    test("directly", () => {
      assertNoLeak(serialized(account()));
    });

    test("one array deep", () => {
      assertNoLeak(serialized([account()]));
    });

    test("one Set deep", () => {
      assertNoLeak(serialized(new Set([account()])));
    });

    test("one Map value deep", () => {
      assertNoLeak(serialized(new Map([["card", account()]])));
    });

    test("one plain-object field deep", () => {
      assertNoLeak(serialized({ holder: account() }));
    });

    test("stacked: object of an array of a Map holding the redacted value", () => {
      const stacked = { list: [new Map([["k", account()]])] };
      assertNoLeak(serialized(stacked));
    });
  });

  describe("resolveTemplate (narration/error-context templates)", () => {
    test("a property path reaching the redacted member", () => {
      assertNoLeak(resolveTemplate("holder secret: {holder.secret}", { holder: account() }));
    });
  });
});

// Value-shape masking (cross-runtime shape F3) is a second, independent redaction axis — it looks at
// what a string *is*, not what its field is named — and must apply on every render path exactly
// like name-based redaction does above: an unnamed occurrence (a bare scalar, an array item, a Map
// value, an ordinarily-named object field) still gets caught.
describe("a value-shaped secret is redacted regardless of its field name, on every render path", () => {
  const PAN = "4111111111111111";

  describe("renderValue (flat)", () => {
    test("a bare top-level scalar", () => {
      expect(renderValue(PAN)).toBe(RedactionPolicy.MARKER);
    });

    test("one array item deep", () => {
      expect(renderValue([PAN])).toBe(`[${RedactionPolicy.MARKER}]`);
    });

    test("a Map value under an ordinarily-named key", () => {
      expect(renderValue(new Map([["note", PAN]]))).toBe(`{note=${RedactionPolicy.MARKER}}`);
    });

    test("an object field with an ordinary, non-deny-listed name", () => {
      expect(renderValue({ memo: PAN })).toBe(`{"memo": ${RedactionPolicy.MARKER}}`);
    });
  });

  describe("renderStructured (typed tree)", () => {
    test("a bare top-level scalar", () => {
      expect(renderStructured(PAN)).toEqual({ kind: "other", text: RedactionPolicy.MARKER });
    });

    test("an object field with an ordinary, non-deny-listed name", () => {
      const result = renderStructured({ memo: PAN });
      expect(result).toEqual({
        kind: "object",
        typeName: "Object",
        fields: { memo: { kind: "other", text: RedactionPolicy.MARKER } },
      });
    });
  });
});
