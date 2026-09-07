// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { expect, test } from "vitest";
import type { TracingLevel } from "../src/index.js";
import { isEnabled } from "../src/index.js";

const VALID_LEVELS: readonly TracingLevel[] = ["off", "errors", "summary", "narrative", "detail"];
const levelArb = fc.constantFrom(...VALID_LEVELS);

test("every TracingLevel is a non-empty string", () => {
  fc.assert(
    fc.property(levelArb, (level) => {
      expect(level.length).toBeGreaterThan(0);
      expect(typeof level).toBe("string");
    }),
  );
});

test("isEnabled is reflexive — every level enables itself", () => {
  fc.assert(
    fc.property(levelArb, (level) => {
      expect(isEnabled(level, level)).toBe(true);
    }),
  );
});

test("isEnabled is transitive — if a≥b and b≥c then a≥c", () => {
  fc.assert(
    fc.property(levelArb, levelArb, levelArb, (a, b, c) => {
      if (isEnabled(a, b) && isEnabled(b, c)) {
        expect(isEnabled(a, c)).toBe(true);
      }
    }),
  );
});
