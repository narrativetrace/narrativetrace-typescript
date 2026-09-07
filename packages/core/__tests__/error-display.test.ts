// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { errorMessage, errorTypeName } from "../src/error-display.js";

describe("errorTypeName", () => {
  test("uses the constructor name of an Error subclass", () => {
    class NotFoundError extends Error {}
    expect(errorTypeName(new NotFoundError("x"))).toBe("NotFoundError");
  });

  test("uses the constructor name of a thrown non-Error object", () => {
    expect(errorTypeName({ code: 42 })).toBe("Object");
  });

  test("falls back to Object for a null-prototype object", () => {
    expect(errorTypeName(Object.create(null))).toBe("Object");
  });

  test("uses the primitive typeof for a thrown non-object", () => {
    expect(errorTypeName("boom")).toBe("string");
    expect(errorTypeName(42)).toBe("number");
  });

  // `Function.prototype.name` is writable, not restricted to identifier syntax — a class whose
  // name was reassigned (or a trace re-hydrated from external data) can carry hostile bytes here
  // just as readily as an exception message can (cross-port shape F4, 2026-09-02 audit).
  test("control-sanitizes a reported type name, like errorMessage sanitizes the message", () => {
    class HostileError extends Error {}
    Object.defineProperty(HostileError, "name", { value: "A\nB" });
    expect(errorTypeName(new HostileError("x"))).toBe("A\\nB");
  });
});

describe("errorMessage", () => {
  test("returns an Error's message", () => {
    expect(errorMessage(new Error("nope"))).toBe("nope");
  });

  test("stringifies a non-Error value", () => {
    expect(errorMessage("raw")).toBe("raw");
  });

  test("control-sanitizes the message", () => {
    expect(errorMessage(new Error("a\nb"))).toBe("a\\nb");
  });
});
