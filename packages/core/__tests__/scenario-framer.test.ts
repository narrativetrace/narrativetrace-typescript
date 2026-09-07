// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { frameScenario } from "../src/scenario-framer.js";

describe("frameScenario", () => {
  test("strips test_ prefix and converts underscores to spaces", () => {
    expect(frameScenario("test_places_order_successfully")).toBe("Places order successfully");
  });

  test("strips should_ prefix", () => {
    expect(frameScenario("should_calculate_total")).toBe("Calculate total");
  });

  test("splits camelCase into words", () => {
    expect(frameScenario("placesOrderSuccessfully")).toBe("Places order successfully");
  });

  test("an already-spaced name passes through verbatim (Java humanize)", () => {
    expect(frameScenario("order is placed")).toBe("order is placed");
    expect(frameScenario("My Scenario")).toBe("My Scenario");
  });

  test("strips a trailing argument suffix", () => {
    expect(frameScenario("placeOrder(args)")).toBe("Place order");
    expect(frameScenario("My Scenario (1, 2)")).toBe("My Scenario");
  });
});
