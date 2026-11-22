// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { renderStructured } from "../src/rendered-value.js";
import { renderValue } from "../src/value-renderer.js";

// B-206, the numeric question: a number's own text is shape-scanned
// like a string's. A Luhn-valid number of 12 or more characters is withheld as the marker on both
// paths; a number that fails the checksum, or is shorter, renders as before.
//
// Known trade-off, accepted family-wide: a Luhn-valid 13-19-digit value that is not a card (an
// epoch-millisecond timestamp, say) renders as the marker too -- the same ~1-in-10 false positive
// a string of digits already has, and only ever number -> marker, never the reverse.
const CARD = 4111111111111111;
const MARKER = "[REDACTED]";

describe("a number's own text passes the shape scan", () => {
  test.each([
    ["number", CARD],
    ["bigint", 4111111111111111n],
  ])("a %s holding a card number renders as the marker on the flat path", (_k, v) => {
    expect(renderValue(v)).toBe(MARKER);
  });

  test.each([
    ["number", CARD],
    ["bigint", 4111111111111111n],
  ])("a %s holding a card number never shows the digits on the structured path", (_k, v) => {
    const out = JSON.stringify(renderStructured(v));
    expect(out).not.toContain("4111111111111111");
    expect(out).toContain(MARKER);
  });

  test("a field and an array item holding the number are withheld too", () => {
    expect(renderValue({ n: CARD })).not.toContain("4111111111111111");
    expect(renderValue([CARD])).toBe(`[${MARKER}]`);
    expect(JSON.stringify(renderStructured({ n: CARD }))).not.toContain("4111111111111111");
  });

  test("a number that fails the checksum, or is short, is unchanged", () => {
    expect(renderValue(4111111111111112)).toBe("4111111111111112");
    expect(renderValue(1700000000001)).toBe("1700000000001");
    expect(renderValue(42)).toBe("42");
    expect(renderValue(3.5)).toBe("3.5");
    expect(renderValue(4111111111111112n)).toBe("4111111111111112n");
    expect(renderStructured(4111111111111112)).toEqual({ kind: "number", value: 4111111111111112 });
    expect(renderStructured(42)).toEqual({ kind: "number", value: 42 });
  });

  test("a double whose text carries an exponent is not scanned", () => {
    expect(renderValue(4.111111111111111e30)).toBe("4.111111111111111e+30");
  });
});

// B-258: the scan floor is the shortest bare-digit secret a matcher recognises, not the card length.
describe("an 11-digit national id held as a number is shape-scanned", () => {
  const CPF = "52998224725";

  test.each([
    ["number", Number(CPF)],
    ["bigint", BigInt(CPF)],
  ])("a %s holding a checksum-valid CPF renders as the marker on the flat path", (_k, v) => {
    expect(renderValue(v)).toBe(MARKER);
  });

  test.each([
    ["number", Number(CPF)],
    ["bigint", BigInt(CPF)],
  ])("a %s holding a checksum-valid CPF never shows the digits on the structured path", (_k, v) => {
    const out = JSON.stringify(renderStructured(v));
    expect(out).not.toContain(CPF);
    expect(out).toContain(MARKER);
  });

  test("a checksum-invalid or short number of that length stays visible", () => {
    expect(renderValue(12345678901)).toBe("12345678901");
    expect(renderValue(52998224726)).toBe("52998224726");
    expect(renderValue(42)).toBe("42");
    expect(renderValue(20261110)).toBe("20261110");
    expect(renderStructured(52998224726)).toEqual({ kind: "number", value: 52998224726 });
  });
});
