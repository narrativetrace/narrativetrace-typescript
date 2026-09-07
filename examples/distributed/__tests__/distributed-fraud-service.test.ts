// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { InMemoryFraudService } from "../src/fraud-service.js";

describe("InMemoryFraudService", () => {
  test("evaluate returns approved for normal customer and amount", () => {
    const svc = new InMemoryFraudService();

    const result = svc.evaluate("C1", 100);

    expect(result).toEqual({ approved: true, riskScore: 0.1 });
  });

  test("evaluate returns rejected for customer C3", () => {
    const svc = new InMemoryFraudService();

    const result = svc.evaluate("C3", 50);

    expect(result).toEqual({ approved: false, riskScore: 0.9 });
  });

  test("evaluate returns rejected for amount over 1000", () => {
    const svc = new InMemoryFraudService();

    const result = svc.evaluate("C1", 1001);

    expect(result).toEqual({ approved: false, riskScore: 0.8 });
  });

  test("evaluate returns approved at boundary amount of 1000", () => {
    const svc = new InMemoryFraudService();

    const result = svc.evaluate("C1", 1000);

    expect(result).toEqual({ approved: true, riskScore: 0.1 });
  });
});
