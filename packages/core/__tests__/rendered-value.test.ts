// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { RedactionPolicy } from "../src/redaction-policy.js";
import { renderStructured } from "../src/rendered-value.js";

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

  // Cross-port mirror of the Java Number-subclass-toString finding
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
