// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { VALUE_FREE_RULES, valueFreeRule } from "../../src/feedback/value-free-rule.js";

/**
 * The rule registry as data: the ids every runtime agreed on, each with a reason a person reads
 * and a predicate that decides.
 *
 * INTENT: the ids are a cross-runtime contract — a refusal names one, the shared corpus asserts
 * one, and a report filed in another runtime's repository quotes one. Renaming one is a product
 * decision, so the list is asserted exactly rather than by count.
 */
describe("the value-free rule registry", () => {
  test("declares the ten rule ids every runtime agreed on, in refusal order", () => {
    expect(VALUE_FREE_RULES.map((rule) => rule.id)).toEqual([
      "vf.rendered-call",
      "vf.rendered-outcome",
      "vf.duration",
      "vf.marker",
      "vf.named-secret",
      "vf.value-shape",
      "vf.entropy",
      "vf.email",
      "vf.home-path",
      "vf.control",
    ]);
  });

  /**
   * A refusal's whole product is its reason, so each one is asserted for the ACTIONABLE half — the
   * phrase that tells a person what to do instead, which is the half a shortened message loses
   * first.
   */
  test.each([
    ["vf.rendered-call", "attach the structural trace (.nt) instead"],
    ["vf.rendered-outcome", "?? incomplete, and never a value"],
    ["vf.duration", "rather than from the structural trace"],
    ["vf.marker", "has nothing to redact and never carries it"],
    ["vf.named-secret", "the name alone is shape and may stay"],
    ["vf.value-shape", "a report never needs the value, only what happened"],
    ["vf.entropy", "describe it in words instead of pasting it"],
    ["vf.email", "the report does not need to say who"],
    ["vf.home-path", "the text was edited by hand afterwards"],
    ["vf.control", "only a line feed and a tab belong in a report"],
  ])("%s says what to do instead of just saying no", (id, actionable) => {
    expect(valueFreeRule(id).reason).toContain(actionable);
  });

  test("gives every rule a reason long enough to be a sentence a person reads", () => {
    for (const rule of VALUE_FREE_RULES) {
      expect(rule.reason.length, rule.id).toBeGreaterThan(80);
    }
  });

  test("looks a rule up by its id", () => {
    expect(valueFreeRule("vf.marker").reason).toContain("redaction marker");
  });

  test("refuses to look up an id no rule has, rather than answering about nothing", () => {
    expect(() => valueFreeRule("vf.not-a-rule")).toThrow(/vf\.not-a-rule/);
  });

  test("reads text and never null", () => {
    expect(() => valueFreeRule("vf.marker").refuses(null as unknown as string)).toThrow(
      /never null/,
    );
  });
});
