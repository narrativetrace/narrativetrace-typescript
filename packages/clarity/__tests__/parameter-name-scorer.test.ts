// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { scoreParameterName } from "../src/parameter-name-scorer.js";

describe("ParameterNameScorer", () => {
  test("domain-specific multi-token parameter scores high", () => {
    const score = scoreParameterName("customerId");
    expect(score).toBeGreaterThan(0.8);
  });

  test("single meaningless char scores very low", () => {
    const score = scoreParameterName("x");
    expect(score).toBeLessThan(0.3);
  });

  test("vague generic parameter scores lower than domain-specific", () => {
    const vague = scoreParameterName("data");
    const domain = scoreParameterName("customerId");
    expect(vague).toBeLessThan(domain);
  });

  test("well-known abbreviation is not heavily penalized", () => {
    const score = scoreParameterName("url");
    expect(score).toBeGreaterThan(0.5);
  });

  test("ambiguous abbreviation is penalized", () => {
    const wellKnown = scoreParameterName("url");
    const ambiguous = scoreParameterName("proc");
    expect(wellKnown).toBeGreaterThan(ambiguous);
  });

  test("standard single token scores medium", () => {
    const score = scoreParameterName("count");
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.9);
  });

  test("empty parameter scores 0", () => {
    expect(scoreParameterName("")).toBe(0);
  });

  test("specific parameter scores higher than generic parameter", () => {
    const specific = scoreParameterName("customerId");
    const generic = scoreParameterName("data");
    expect(specific).toBeGreaterThan(generic);
  });

  test("multi-token parameter scores higher than single-token", () => {
    const multi = scoreParameterName("customerId");
    const single = scoreParameterName("customer");
    expect(multi).toBeGreaterThan(single);
  });
});
