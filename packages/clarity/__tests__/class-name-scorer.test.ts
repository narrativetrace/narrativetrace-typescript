// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { scoreClassName } from "../src/class-name-scorer.js";

describe("ClassNameScorer", () => {
  test("design pattern suffix scores highest tier", () => {
    const score = scoreClassName("OrderFactory");
    expect(score).toBeGreaterThan(0.8);
  });

  test("functional suffix scores highest tier", () => {
    const score = scoreClassName("OrderService");
    expect(score).toBeGreaterThan(0.8);
  });

  test("descriptive suffix scores medium-high", () => {
    const score = scoreClassName("OrderConverter");
    expect(score).toBeGreaterThan(0.6);
  });

  test("generic suffix scores lower than domain suffix", () => {
    const generic = scoreClassName("OrderManager");
    const domain = scoreClassName("OrderService");
    expect(generic).toBeLessThan(domain);
  });

  test("domain prefix scores higher than vague prefix", () => {
    const domain = scoreClassName("OrderService");
    const vague = scoreClassName("DataService");
    expect(domain).toBeGreaterThan(vague);
  });

  test("abbreviated prefix is penalized", () => {
    const clear = scoreClassName("OrderService");
    const abbreviated = scoreClassName("OrdService");
    expect(clear).toBeGreaterThan(abbreviated);
  });

  test("ideal token count of 2-3 scores highest", () => {
    const twoTokens = scoreClassName("OrderService");
    const singleToken = scoreClassName("Service");
    expect(twoTokens).toBeGreaterThan(singleToken);
  });

  test("morphology bonus for noun-ending suffix", () => {
    const nounSuffix = scoreClassName("OrderValidation");
    expect(nounSuffix).toBeGreaterThan(0.5);
  });

  test("domain class scores higher than generic class", () => {
    const domainScore = scoreClassName("OrderService");
    const genericScore = scoreClassName("DataManager");
    expect(domainScore).toBeGreaterThan(genericScore);
  });

  test("empty class name scores 0", () => {
    expect(scoreClassName("")).toBe(0);
  });

  test("four-token class name scores slightly lower than two-token", () => {
    const fourTokens = scoreClassName("AbstractOrderItemFactory");
    const twoTokens = scoreClassName("OrderFactory");
    expect(twoTokens).toBeGreaterThan(fourTokens);
  });

  test("five-plus token class name is penalized", () => {
    const fiveTokens = scoreClassName("VeryLongAbstractOrderItemFactory");
    expect(fiveTokens).toBeGreaterThan(0);
    expect(fiveTokens).toBeLessThanOrEqual(1);
  });

  test("scores are between 0 and 1", () => {
    const names = ["OrderService", "DataManager", "Helper", "InventoryRepository", "A"];
    for (const name of names) {
      const score = scoreClassName(name);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
