// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { ExceptionMessage } from "../src/exception-message.js";
import { RedactionPolicy } from "../src/redaction-policy.js";

// Public test card number, not a real credential; the policy recognizes these bytes by shape.
const PAN = "4111111111111111";

describe("ExceptionMessage", () => {
  test("a message the policy flags is replaced whole by the marker", () => {
    expect(ExceptionMessage.of(new Error(PAN))).toBe(RedactionPolicy.MARKER);
  });

  test("a harmless message is control-escaped", () => {
    expect(ExceptionMessage.of(new Error("a\nb"))).toBe("a\\nb");
  });

  test("a non-Error value is stringified and filtered the same way", () => {
    expect(ExceptionMessage.of("raw")).toBe("raw");
    expect(ExceptionMessage.of(PAN)).toBe(RedactionPolicy.MARKER);
  });

  test("a message that cannot be read answers <error>", () => {
    const hostile = new Error("x");
    Object.defineProperty(hostile, "message", {
      get() {
        throw new Error("boom");
      },
    });
    expect(ExceptionMessage.of(hostile)).toBe("<error>");
    expect(
      ExceptionMessage.of({
        toString: () => {
          throw new Error("no");
        },
      }),
    ).toBe("<error>");
  });

  test("an absent message is null, and text spells it null", () => {
    const e = new Error("x");
    Object.defineProperty(e, "message", { value: undefined });
    expect(ExceptionMessage.of(e)).toBeNull();
    expect(ExceptionMessage.text(e)).toBe("null");
  });
});
