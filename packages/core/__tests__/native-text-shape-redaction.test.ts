// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { type RenderedValue, renderStructured } from "../src/rendered-value.js";
import { renderValue } from "../src/value-renderer.js";

// B-206 (family twin of Swift B-200): a platform leaf rendered through its own string conversion
// is checked by SHAPE on the raw text before sanitise and cap, like every other string.
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
const CARD = "4111111111111111";

function urlWithText(text: string): URL {
  const u = new URL("https://example.com/a");
  Object.defineProperty(u, "toString", { value: () => text });
  return u;
}

function dateWithText(text: string): Date {
  const d = new Date(0);
  Object.defineProperty(d, "toISOString", { value: () => text });
  return d;
}

function flatten(r: RenderedValue): string {
  return JSON.stringify(r);
}

describe("native text of a platform leaf passes the shape scan", () => {
  for (const [name, secret] of [
    ["a JWT", JWT],
    ["a public test card number", CARD],
  ] as const) {
    test(`flat path: a URL whose own text is ${name} renders as the marker`, () => {
      expect(renderValue(urlWithText(secret))).toBe("[REDACTED]");
    });

    test(`flat path: a Date whose native text is ${name} renders as the marker`, () => {
      expect(renderValue(dateWithText(secret))).toBe("[REDACTED]");
    });

    test(`flat path: a field holding such a leaf shows the marker, never ${name}`, () => {
      expect(renderValue({ when: urlWithText(secret) })).not.toContain(secret);
    });

    test(`structured path: such a leaf never shows ${name} in clear`, () => {
      expect(flatten(renderStructured(urlWithText(secret)))).not.toContain(secret);
      expect(flatten(renderStructured(dateWithText(secret)))).not.toContain(secret);
      expect(flatten(renderStructured({ when: urlWithText(secret) }))).not.toContain(secret);
    });
  }

  test("a symbol description is leaf text too, on both paths", () => {
    expect(renderValue(Symbol(JWT))).toBe("Symbol([REDACTED])");
    expect(flatten(renderStructured(Symbol(JWT)))).not.toContain(JWT);
    expect(renderValue(Symbol("tag"))).toBe("Symbol(tag)");
  });

  test("a plain leaf text is unchanged", () => {
    expect(renderValue(urlWithText("plain text"))).toBe("plain text");
    expect(renderValue(new URL("https://example.com/a?b=1"))).toBe("https://example.com/a?b=1");
  });

  test("control characters are still escaped when the text is not secret-shaped", () => {
    expect(renderValue(urlWithText("a\nb"))).not.toContain("\n");
  });
});
