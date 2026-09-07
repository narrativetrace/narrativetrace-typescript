// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { buildFailureReport } from "../src/failure-report.js";

describe("buildFailureReport", () => {
  test("frames the scenario and labels the execution trace (Java parity)", () => {
    expect(buildFailureReport("Places an order", "OrderService.placeOrder\n  → OK")).toBe(
      "\n\nPlaces an order\n\nExecution trace:\nOrderService.placeOrder\n  → OK",
    );
  });

  test("keeps an empty rendered trace verbatim after the label", () => {
    expect(buildFailureReport("Scenario", "")).toBe("\n\nScenario\n\nExecution trace:\n");
  });
});
