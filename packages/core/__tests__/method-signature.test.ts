// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { methodSignature } from "../src/method-signature.js";
import { parameterCapture } from "../src/parameter-capture.js";

describe("methodSignature", () => {
  test("className, methodName, empty params", () => {
    const sig = methodSignature("OrderService", "placeOrder", []);
    expect(sig.className).toBe("OrderService");
    expect(sig.methodName).toBe("placeOrder");
    expect(sig.parameters).toEqual([]);
  });

  test("holds ParameterCapture list", () => {
    const params = [
      parameterCapture("id", '"42"', false),
      parameterCapture("name", '"Alice"', false),
    ];
    const sig = methodSignature("UserService", "getUser", params);
    expect(sig.parameters).toHaveLength(2);
    expect(sig.parameters[0]?.name).toBe("id");
    expect(sig.parameters[1]?.name).toBe("name");
  });

  test("holds narration + errorContext", () => {
    const sig = methodSignature("Svc", "op", [], {
      narration: "places an order",
      errorContext: "failed to place order",
    });
    expect(sig.narration).toBe("places an order");
    expect(sig.errorContext).toBe("failed to place order");
  });

  test("omitted optionals are undefined", () => {
    const sig = methodSignature("Svc", "op", []);
    expect(sig.narration).toBeUndefined();
    expect(sig.errorContext).toBeUndefined();
  });

  test("object is frozen", () => {
    const sig = methodSignature("Svc", "op", []);
    expect(() => {
      (sig as { className: string }).className = "X";
    }).toThrow(TypeError);
  });

  test("parameters array is frozen (defensive copy)", () => {
    const params = [parameterCapture("x", "1", false)];
    const sig = methodSignature("Svc", "op", params);
    expect(() => {
      (sig.parameters as unknown[]).push("hacked");
    }).toThrow(TypeError);
    // original array mutation doesn't affect sig
    params.push(parameterCapture("y", "2", false));
    expect(sig.parameters).toHaveLength(1);
  });

  test("narration without errorContext", () => {
    const sig = methodSignature("Svc", "op", [], { narration: "does something" });
    expect(sig.narration).toBe("does something");
    expect(sig.errorContext).toBeUndefined();
  });
});
