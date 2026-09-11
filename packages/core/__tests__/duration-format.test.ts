// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { formatDurationMs } from "../src/duration-format.js";

describe("formatDurationMs", () => {
  test("rounds to an integer once the magnitude reaches 1ms", () => {
    expect(formatDurationMs(3)).toBe("3ms");
    expect(formatDurationMs(412)).toBe("412ms");
    expect(formatDurationMs(1.4)).toBe("1ms");
    expect(formatDurationMs(1.5)).toBe("2ms");
  });

  // The bug this formatter exists for: performance.now()-measured durations are sub-millisecond
  // fractional floats, not the whole-millisecond counts every runtime's text renderers show.
  test("keeps up to two decimal places below 1ms", () => {
    expect(formatDurationMs(0.5849169999999901)).toBe("0.58ms");
    expect(formatDurationMs(0.1)).toBe("0.1ms");
  });

  test("zero renders as a plain integer", () => {
    expect(formatDurationMs(0)).toBe("0ms");
  });

  test("exactly 1ms takes the integer branch", () => {
    expect(formatDurationMs(1)).toBe("1ms");
  });

  test("a negative duration formats by magnitude, keeping its sign", () => {
    expect(formatDurationMs(-2.5)).toBe("-2ms");
    expect(formatDurationMs(-0.4)).toBe("-0.4ms");
  });
});
