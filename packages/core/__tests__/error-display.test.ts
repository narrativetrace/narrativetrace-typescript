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
  // just as readily as an exception message can (cross-runtime shape F4, 2026-09-02 audit).
  test("control-sanitizes a reported type name, like errorMessage sanitizes the message", () => {
    class HostileError extends Error {}
    Object.defineProperty(HostileError, "name", { value: "A\nB" });
    expect(errorTypeName(new HostileError("x"))).toBe("A\\nB");
  });

  // A thrown value is held LIVE in TraceOutcome (exception-message.ts's INTENT comment), so
  // reading its type name is reading an application object at emit time — the same hazard
  // ExceptionMessage.of already answers with `<error>` on the message axis ("a message that cannot
  // be read answers <error>"). The type axis has no such guard: `error instanceof Error` and
  // `error.constructor` are both operations an application object can make throw, and this is the
  // one reader every text renderer, the diagram walk and the pino/winston/OTel consumers share.
  // The degraded text is the fix's choice; what these pin is that nothing propagates.
  describe("ADV-2026-11-03-1: a type name that cannot be read degrades, it never propagates", () => {
    test("a revoked proxy as the thrown value", () => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      expect(() => errorTypeName(proxy)).not.toThrow();
    });

    test("a thrown Error whose own constructor accessor throws", () => {
      const hostile = new Error("x");
      Object.defineProperty(hostile, "constructor", {
        get() {
          throw new Error("boom");
        },
      });
      expect(() => errorTypeName(hostile)).not.toThrow();
    });

    test("a thrown non-Error object whose own constructor accessor throws", () => {
      const hostile = {};
      Object.defineProperty(hostile, "constructor", {
        get() {
          throw new Error("boom");
        },
      });
      expect(() => errorTypeName(hostile)).not.toThrow();
    });
  });

  // A type name is author-written metadata, not data: it is control-escaped but never shape-scanned.
  test("a credential-shaped type name prints as written", () => {
    class Hostile extends Error {}
    // Public test card number, not a real credential.
    Object.defineProperty(Hostile, "name", { value: "4111111111111111" });

    expect(errorTypeName(new Hostile("ok"))).toBe("4111111111111111");
  });

  test("a type name carrying a control character is escaped", () => {
    class Hostile extends Error {}
    Object.defineProperty(Hostile, "name", { value: "A\nB" });

    expect(errorTypeName(new Hostile("ok"))).toBe("A\\nB");
  });

  describe("a type name that is not a string degrades, it never propagates", () => {
    test("a thrown object whose constructor carries a numeric name", () => {
      expect(() => errorTypeName({ constructor: { name: 404 } })).not.toThrow();
    });

    test("a thrown object whose constructor carries an object name", () => {
      expect(() => errorTypeName({ constructor: { name: { toString: () => "X" } } })).not.toThrow();
    });
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

  test("is the filtered reading: a credential-shaped message is the marker (B-174)", () => {
    // Public test card number, not a real credential.
    expect(errorMessage(new Error("4111111111111111"))).toBe("[REDACTED]");
  });
});
