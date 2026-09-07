// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { scoreMethodName } from "../src/method-name-scorer.js";

describe("MethodNameScorer", () => {
  test("domain verb with specific nouns scores high", () => {
    const score = scoreMethodName("placeOrder");
    expect(score).toBeGreaterThan(0.8);
  });

  test("generic verb is penalized", () => {
    const domain = scoreMethodName("placeOrder");
    const generic = scoreMethodName("processOrder");
    expect(domain).toBeGreaterThan(generic);
  });

  test("vague noun tokens are penalized", () => {
    const specific = scoreMethodName("placeOrder");
    const vague = scoreMethodName("placeData");
    expect(specific).toBeGreaterThan(vague);
  });

  test("abbreviated tokens are penalized", () => {
    const clear = scoreMethodName("createOrder");
    const abbreviated = scoreMethodName("createOrd");
    expect(clear).toBeGreaterThan(abbreviated);
  });

  test("ideal token count of 2-3 scores well", () => {
    const twoTokens = scoreMethodName("placeOrder");
    const singleToken = scoreMethodName("place");
    expect(twoTokens).toBeGreaterThan(singleToken);
  });

  test("single-token method scores lower", () => {
    const single = scoreMethodName("process");
    expect(single).toBeLessThan(0.5);
  });

  test("long method name (4+ tokens) slightly penalized vs 2-token", () => {
    const long = scoreMethodName("validateAndProcessOrderItems");
    const short = scoreMethodName("validateOrder");
    expect(short).toBeGreaterThan(long);
  });

  test("empty method name scores 0", () => {
    expect(scoreMethodName("")).toBe(0);
  });

  test("scores are between 0 and 1", () => {
    const names = ["placeOrder", "process", "isValid", "handleData", "x"];
    for (const name of names) {
      const score = scoreMethodName(name);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  test("standard verb scores between domain and generic", () => {
    const domain = scoreMethodName("createOrder");
    const standard = scoreMethodName("filterOrders");
    const generic = scoreMethodName("processOrder");
    expect(domain).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(generic);
  });

  test("four-token method name slightly penalized vs two-token", () => {
    const four = scoreMethodName("createNewOrderItem");
    expect(four).toBeGreaterThan(0);
    expect(four).toBeLessThanOrEqual(1);
  });
});
