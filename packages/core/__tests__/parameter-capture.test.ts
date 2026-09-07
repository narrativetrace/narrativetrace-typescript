// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parameterCapture } from "../src/parameter-capture.js";

describe("parameterCapture", () => {
  test("captures name, renderedValue, redacted=false", () => {
    const pc = parameterCapture("orderId", '"order-42"', false);
    expect(pc.name).toBe("orderId");
    expect(pc.renderedValue).toBe('"order-42"');
    expect(pc.redacted).toBe(false);
  });

  test("redacted=true", () => {
    const pc = parameterCapture("password", "***", true);
    expect(pc.redacted).toBe(true);
  });

  test("empty string renderedValue = suppressed (not void)", () => {
    const pc = parameterCapture("secret", "", false);
    expect(pc.renderedValue).toBe("");
  });

  test("returned object is frozen (mutate → TypeError)", () => {
    const pc = parameterCapture("x", "1", false);
    expect(() => {
      (pc as { name: string }).name = "y";
    }).toThrow(TypeError);
  });

  test("empty name allowed", () => {
    const pc = parameterCapture("", "42", false);
    expect(pc.name).toBe("");
  });

  test("factory preserves all inputs", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.boolean(), (name, value, redacted) => {
        const pc = parameterCapture(name, value, redacted);
        expect(pc.name).toBe(name);
        expect(pc.renderedValue).toBe(value);
        expect(pc.redacted).toBe(redacted);
      }),
    );
  });

  test("always returns frozen object", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.boolean(), (name, value, redacted) => {
        const pc = parameterCapture(name, value, redacted);
        expect(Object.isFrozen(pc)).toBe(true);
      }),
    );
  });
});
