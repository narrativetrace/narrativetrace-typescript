// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClientIp, HttpRoute } from "../src/branded-types.js";
import { NOOP_CONTEXT } from "../src/noop-context.js";
import { parameterCapture } from "../src/parameter-capture.js";

describe("NOOP_CONTEXT", () => {
  test("all methods no-op, trace empty", () => {
    NOOP_CONTEXT.enterMethod("Svc", "op", [parameterCapture("id", '"42"', false)]);
    NOOP_CONTEXT.exitMethodWithReturn('"ok"');
    NOOP_CONTEXT.enterMethod("Svc", "fail", []);
    NOOP_CONTEXT.exitMethodWithException(new Error("boom"));
    const tree = NOOP_CONTEXT.captureTrace();
    expect(tree.isEmpty).toBe(true);
  });

  test("isActive → false", () => {
    expect(NOOP_CONTEXT.isActive).toBe(false);
  });

  test("reset is a no-op", () => {
    NOOP_CONTEXT.reset();
    expect(NOOP_CONTEXT.captureTrace().isEmpty).toBe(true);
  });

  test("runScoped returns fn result (identity)", () => {
    const result = NOOP_CONTEXT.runScoped(42, () => "hello");
    expect(result).toBe("hello");
  });

  test("frozen singleton", () => {
    expect(Object.isFrozen(NOOP_CONTEXT)).toBe(true);
  });

  test("traceId() returns zero trace id", () => {
    expect(NOOP_CONTEXT.traceId()).toBe("00000000000000000000000000000000");
  });

  test("parentOf returns null", () => {
    expect(NOOP_CONTEXT.parentOf("" as never)).toBeNull();
  });

  test("detachFrame is a no-op", () => {
    NOOP_CONTEXT.detachFrame("" as never);
    expect(NOOP_CONTEXT.isActive).toBe(false);
  });

  test("setRequestContext and setUserContext are no-ops", () => {
    NOOP_CONTEXT.setRequestContext("GET", "/api" as HttpRoute, "127.0.0.1" as ClientIp);
    NOOP_CONTEXT.setUserContext();
    expect(NOOP_CONTEXT.captureTrace().isEmpty).toBe(true);
  });
});
