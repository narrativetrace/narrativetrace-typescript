// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { scoreCohesion } from "../src/cohesion-scorer.js";

// Behaviors mirror Java CohesionScorer.scoreClass: startsWith role-alignment ratio, with a
// BROAD (0.9) / UNKNOWN (0.7) envelope for roles that carry no verb expectations.
describe("CohesionScorer", () => {
  test("role with expected verbs: all methods aligned scores 1.0", () => {
    expect(scoreCohesion(["findUser", "saveUser", "deleteUser"], "UserRepository")).toBe(1.0);
  });

  test("role with expected verbs: no methods aligned scores 0.0", () => {
    expect(scoreCohesion(["renderReport"], "GuestRepository")).toBe(0.0);
  });

  test("role with expected verbs: partial alignment is the exact ratio", () => {
    // find aligns, render does not → 1 of 2.
    expect(scoreCohesion(["findUser", "renderReport"], "UserRepository")).toBe(0.5);
  });

  test("newly promoted policy role aligns via expected verbs", () => {
    expect(scoreCohesion(["evaluatePolicy", "enforcePolicy", "applyPolicy"], "AccessPolicy")).toBe(
      1.0,
    );
  });

  test("service is an unconstrained broad role and scores 0.9 regardless of verbs", () => {
    // Java parity: Service has no expected verbs, so even non-role verbs are not penalized.
    expect(scoreCohesion(["placeOrder", "doStuff", "handleThings"], "OrderService")).toBe(0.9);
  });

  test("recognized suffix category with no verb expectations scores 0.9 (broad)", () => {
    // Strategy is a design-pattern suffix but carries no expected verbs → broad.
    expect(scoreCohesion(["doAnything"], "SortStrategy")).toBe(0.9);
  });

  test("unrecognized suffix scores 0.7 (unknown)", () => {
    expect(scoreCohesion(["createOrder", "cancelOrder"], "OrderWidget")).toBe(0.7);
  });

  test("missing class name scores 0.7 (unknown)", () => {
    expect(scoreCohesion(["createOrder", "cancelOrder"])).toBe(0.7);
  });

  test("empty class name string scores 0.7 (unknown)", () => {
    expect(scoreCohesion(["createOrder", "findOrder"], "")).toBe(0.7);
  });

  test("role with expected verbs but empty method list scores 0.7", () => {
    expect(scoreCohesion([], "UserRepository")).toBe(0.7);
  });

  test("broad role with empty method list still scores 0.9", () => {
    // The broad branch returns before the empty-method check (Java ordering).
    expect(scoreCohesion([], "OrderService")).toBe(0.9);
  });

  test("alignment uses startsWith, not equality (Java quirk)", () => {
    // Validator expects "is"; "issue" starts with "is" so it counts as aligned.
    expect(scoreCohesion(["issueRefund"], "PaymentValidator")).toBe(1.0);
  });

  test("single aligned method scores 1.0", () => {
    expect(scoreCohesion(["findOrder"], "OrderRepository")).toBe(1.0);
  });

  test("consistent role-aligned verbs score higher than mixed for same class", () => {
    const consistent = scoreCohesion(["findUser", "findOrder", "findProduct"], "DataRepository");
    const mixed = scoreCohesion(["findUser", "processOrder", "handleProduct"], "DataRepository");
    expect(consistent).toBeGreaterThan(mixed);
  });

  test("empty token methods do not align", () => {
    expect(scoreCohesion(["", ""], "UserRepository")).toBe(0);
  });

  test("all scores stay within [0, 1]", () => {
    const score = scoreCohesion(["get", "put", "save"], "SessionStore");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
