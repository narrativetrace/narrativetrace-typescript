// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { getRedactedParams, registerRedactedParams } from "../src/redacted-params-registry.js";

describe("redacted-params-registry", () => {
  test("a method never registered has no redacted params", () => {
    function neverRegistered() {}
    expect(getRedactedParams(neverRegistered)).toBeUndefined();
  });

  test("registered indices are readable back for the exact same function", () => {
    function pay(_policyId: string, _paymentToken: string) {}
    registerRedactedParams(pay, [1]);

    expect(getRedactedParams(pay)?.has(1)).toBe(true);
    expect(getRedactedParams(pay)?.has(0)).toBe(false);
  });

  test("multiple indices are all recorded", () => {
    function charge(_a: unknown, _b: unknown, _c: unknown) {}
    registerRedactedParams(charge, [1, 2]);

    const redacted = getRedactedParams(charge);
    expect(redacted?.has(1)).toBe(true);
    expect(redacted?.has(2)).toBe(true);
    expect(redacted?.has(0)).toBe(false);
  });

  test("keyed by identity, not by name or shape — a different function is unaffected", () => {
    function fnA(_x: unknown) {}
    function fnB(_x: unknown) {}
    registerRedactedParams(fnA, [0]);

    expect(getRedactedParams(fnB)).toBeUndefined();
  });

  test("re-registering the same function replaces its previous indices", () => {
    function method(_a: unknown, _b: unknown) {}
    registerRedactedParams(method, [0]);
    registerRedactedParams(method, [1]);

    const redacted = getRedactedParams(method);
    expect(redacted?.has(0)).toBe(false);
    expect(redacted?.has(1)).toBe(true);
  });
});
