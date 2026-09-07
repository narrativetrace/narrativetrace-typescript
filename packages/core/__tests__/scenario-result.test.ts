// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { scenarioDisplayName, scenarioResult } from "../src/scenario-result.js";

describe("scenarioResult", () => {
  test("a scenario with no failure succeeded", () => {
    expect(scenarioResult(false)).toBe("success");
  });

  test("a scenario with a failure errored", () => {
    expect(scenarioResult(true)).toBe("error");
  });
});

describe("scenarioDisplayName", () => {
  test("spells success PASSED and error FAILED for a human reader", () => {
    expect(scenarioDisplayName("success")).toBe("PASSED");
    expect(scenarioDisplayName("error")).toBe("FAILED");
  });

  test("never leaks the wire spelling into a caption", () => {
    expect(scenarioDisplayName(scenarioResult(true))).not.toBe("error");
    expect(scenarioDisplayName(scenarioResult(false))).not.toBe("success");
  });
});
