// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { compareVersions, parseVersion, satisfiesRange } from "../src/semver-lite.js";

describe("parseVersion", () => {
  test("parses a full version", () => {
    expect(parseVersion("20.11.3")).toEqual({ major: 20, minor: 11, patch: 3 });
  });

  test("strips a leading v", () => {
    expect(parseVersion("v20.11.3")).toEqual({ major: 20, minor: 11, patch: 3 });
  });

  test("defaults missing minor/patch to zero", () => {
    expect(parseVersion("20")).toEqual({ major: 20, minor: 0, patch: 0 });
    expect(parseVersion("20.11")).toEqual({ major: 20, minor: 11, patch: 0 });
  });

  test("returns undefined for unparseable input", () => {
    expect(parseVersion("not-a-version")).toBeUndefined();
  });
});

function version(raw: string) {
  const parsed = parseVersion(raw);
  if (!parsed) throw new Error(`unparseable test fixture version: ${raw}`);
  return parsed;
}

describe("compareVersions", () => {
  test("orders by major, then minor, then patch", () => {
    expect(compareVersions(version("2.0.0"), version("1.9.9"))).toBeGreaterThan(0);
    expect(compareVersions(version("1.2.0"), version("1.10.0"))).toBeLessThan(0);
    expect(compareVersions(version("1.2.3"), version("1.2.2"))).toBeGreaterThan(0);
    expect(compareVersions(version("1.2.3"), version("1.2.3"))).toBe(0);
  });
});

describe("satisfiesRange", () => {
  test(">=20 accepts 20 and above, rejects below", () => {
    expect(satisfiesRange("20.0.0", ">=20")).toBe(true);
    expect(satisfiesRange("22.4.0", ">=20")).toBe(true);
    expect(satisfiesRange("18.19.0", ">=20")).toBe(false);
  });

  test("a caret range matches only within the same major", () => {
    expect(satisfiesRange("3.2.0", "^3.0.0")).toBe(true);
    expect(satisfiesRange("4.0.0", "^3.0.0")).toBe(false);
    expect(satisfiesRange("2.9.9", "^3.0.0")).toBe(false);
  });

  test("0.x caret ranges are minor-locked", () => {
    expect(satisfiesRange("0.2.9", "^0.2.3")).toBe(true);
    expect(satisfiesRange("0.3.0", "^0.2.3")).toBe(false);
  });

  test("0.0.x caret ranges are patch-locked", () => {
    expect(satisfiesRange("0.0.3", "^0.0.3")).toBe(true);
    expect(satisfiesRange("0.0.4", "^0.0.3")).toBe(false);
    expect(satisfiesRange("1.0.0", "^0.0.3")).toBe(false);
  });

  test("an OR'd range matches any clause — the vitest peer shape", () => {
    const range = "^1.0.0 || ^2.0.0 || ^3.0.0";
    expect(satisfiesRange("1.6.0", range)).toBe(true);
    expect(satisfiesRange("2.1.9", range)).toBe(true);
    expect(satisfiesRange("3.2.0", range)).toBe(true);
    expect(satisfiesRange("0.34.0", range)).toBe(false);
    expect(satisfiesRange("4.0.0", range)).toBe(false);
  });

  test("an .x range matches like a caret at that boundary", () => {
    expect(satisfiesRange("1.4.2", "1.x")).toBe(true);
    expect(satisfiesRange("2.0.0", "1.x")).toBe(false);
  });

  test("an exact version matches only itself", () => {
    expect(satisfiesRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.4", "1.2.3")).toBe(false);
  });

  test("unparseable input never throws — reports a mismatch", () => {
    expect(satisfiesRange("nonsense", ">=20")).toBe(false);
    expect(satisfiesRange("20.0.0", "not-a-range")).toBe(false);
  });

  test("an unparseable base after a >= or ^ prefix never throws — reports a mismatch", () => {
    expect(satisfiesRange("20.0.0", ">=bogus")).toBe(false);
    expect(satisfiesRange("20.0.0", "^bogus")).toBe(false);
  });

  test("an unparseable base after stripping .x never throws — reports a mismatch", () => {
    expect(satisfiesRange("20.0.0", "bogus.x")).toBe(false);
  });

  test("a clause with surrounding whitespace is trimmed before its prefix is checked", () => {
    expect(satisfiesRange("2.1.0", "^1.0.0 ||  ^2.0.0  || ^3.0.0")).toBe(true);
  });
});
