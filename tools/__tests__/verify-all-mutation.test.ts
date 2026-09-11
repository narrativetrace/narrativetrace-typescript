// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { mutationScore } from "../verify-all-mutation.js";

describe("mutationScore", () => {
  test("killed and timeout both count as detected", () => {
    const score = mutationScore({ killed: 8, timeout: 1, survived: 1, noCoverage: 0 });
    expect(score).toBe(90);
  });

  test("a mutant nothing covered still lowers the score, per Stryker's own definition", () => {
    const withCoverageGap = mutationScore({ killed: 8, timeout: 0, survived: 0, noCoverage: 2 });
    const withoutCoverageGap = mutationScore({ killed: 8, timeout: 0, survived: 0, noCoverage: 0 });
    expect(withCoverageGap).toBe(80);
    expect(withoutCoverageGap).toBe(100);
  });

  test("no mutants at all is 0, never NaN or a fabricated 100", () => {
    expect(mutationScore({ killed: 0, timeout: 0, survived: 0, noCoverage: 0 })).toBe(0);
  });
});
