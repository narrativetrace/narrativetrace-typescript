// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { DailyRates } from "../src/daily-rates.js";
import { RateTableConverter } from "../src/rate-table-converter.js";

describe("RateTableConverter", () => {
  const converter = new RateTableConverter(new DailyRates());

  test("the same currency is not converted", () => {
    expect(converter.convert(4599, "EUR", "EUR")).toBe(4599);
  });

  test("converts at today's rate", () => {
    expect(converter.convert(10000, "EUR", "CHF")).toBe(9300);
    expect(converter.convert(20000, "EUR", "USD")).toBe(21600);
  });

  test("an unknown pair is refused", () => {
    expect(() => converter.convert(100, "EUR", "JPY")).toThrow(RangeError);
  });
});
