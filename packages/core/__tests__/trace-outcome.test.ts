// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { returned, threw } from "../src/trace-outcome.js";

describe("TraceOutcome", () => {
  test("returned holds rendered value", () => {
    const r = returned('"order-42"');
    expect(r.kind).toBe("returned");
    expect(r.renderedValue).toBe('"order-42"');
  });

  test("returned(null) = void", () => {
    const r = returned(null);
    expect(r.renderedValue).toBeNull();
  });

  test("threw holds Error", () => {
    const err = new Error("boom");
    const t = threw(err);
    expect(t.kind).toBe("threw");
    expect(t.error).toBe(err);
  });

  test("threw holds non-Error (string, number)", () => {
    const t1 = threw("oops");
    expect(t1.error).toBe("oops");
    const t2 = threw(42);
    expect(t2.error).toBe(42);
  });

  test("discriminated union narrows in switch", () => {
    const outcomes = [returned('"ok"'), threw(new Error("fail"))];
    for (const outcome of outcomes) {
      switch (outcome.kind) {
        case "returned":
          expect(outcome.renderedValue).toBe('"ok"');
          break;
        case "threw":
          expect(outcome.error).toBeInstanceOf(Error);
          break;
      }
    }
  });

  test("both variants frozen", () => {
    const r = returned('"x"');
    expect(() => {
      (r as { kind: string }).kind = "threw";
    }).toThrow(TypeError);
    const t = threw("err");
    expect(() => {
      (t as { kind: string }).kind = "returned";
    }).toThrow(TypeError);
  });

  test('returned("") ≠ returned(null)', () => {
    const empty = returned("");
    const voidReturn = returned(null);
    expect(empty.renderedValue).toBe("");
    expect(voidReturn.renderedValue).toBeNull();
    expect(empty.renderedValue).not.toBe(voidReturn.renderedValue);
  });
});
