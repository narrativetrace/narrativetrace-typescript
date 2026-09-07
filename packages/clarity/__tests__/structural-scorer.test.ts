// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { scoreStructural } from "../src/structural-scorer.js";

describe("StructuralScorer", () => {
  test("penalizes methods with more than 4 parameters", () => {
    const fewParams = scoreStructural({ paramCount: 2, depth: 1 });
    const manyParams = scoreStructural({ paramCount: 6, depth: 1 });
    expect(fewParams).toBeGreaterThan(manyParams);
  });

  test("penalizes depth greater than 5", () => {
    const shallow = scoreStructural({ paramCount: 1, depth: 3 });
    const deep = scoreStructural({ paramCount: 1, depth: 8 });
    expect(shallow).toBeGreaterThan(deep);
  });

  test("no penalty for params <= 4 and depth <= 5", () => {
    expect(scoreStructural({ paramCount: 4, depth: 5 })).toBe(1.0);
    expect(scoreStructural({ paramCount: 0, depth: 1 })).toBe(1.0);
  });

  test("score never goes below 0", () => {
    const extreme = scoreStructural({ paramCount: 20, depth: 20 });
    expect(extreme).toBe(0);
  });

  test("param penalty is Java's 0.10 per param over 4", () => {
    // 5 params → one over the budget → 1.0 - 0.10 (Java StructuralFactor parity, not 0.15)
    expect(scoreStructural({ paramCount: 5, depth: 1 })).toBeCloseTo(0.9, 10);
    expect(scoreStructural({ paramCount: 6, depth: 1 })).toBeCloseTo(0.8, 10);
  });

  test("depth penalty is Java's 0.05 per level over 5", () => {
    // depth 6 → one over the budget → 1.0 - 0.05 (Java parity, not 0.10)
    expect(scoreStructural({ paramCount: 1, depth: 6 })).toBeCloseTo(0.95, 10);
    expect(scoreStructural({ paramCount: 1, depth: 7 })).toBeCloseTo(0.9, 10);
  });
});
