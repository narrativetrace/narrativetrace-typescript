// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { isSubsequence, unifiedLineDiff } from "../src/line-diff.js";

describe("isSubsequence", () => {
  it("is true when current is a prefix subsequence of baseline", () => {
    expect(isSubsequence("a\nb\nc\n", "a\nb\n")).toBe(true);
  });

  it("is true for an empty current document", () => {
    expect(isSubsequence("a\nb\n", "")).toBe(true);
  });

  it("is false when current adds a line not in baseline", () => {
    expect(isSubsequence("a\nb\n", "a\nb\nc\n")).toBe(false);
  });

  it("is false when current reorders lines", () => {
    expect(isSubsequence("a\nb\n", "b\na\n")).toBe(false);
  });

  it("is true for byte-identical documents", () => {
    expect(isSubsequence("a\nb\n", "a\nb\n")).toBe(true);
  });
});

describe("unifiedLineDiff", () => {
  it("returns an empty string for identical documents", () => {
    expect(unifiedLineDiff("a\nb\n", "a\nb\n")).toBe(" a\n b\n");
  });

  it("marks a pure addition with +", () => {
    expect(unifiedLineDiff("a\n", "a\nb\n")).toBe(" a\n+b\n");
  });

  it("marks a pure removal with -", () => {
    expect(unifiedLineDiff("a\nb\n", "a\n")).toBe(" a\n-b\n");
  });

  it("handles an empty baseline against a non-empty current", () => {
    expect(unifiedLineDiff("", "a\n")).toBe("+a\n");
  });

  it("handles an empty current against a non-empty baseline", () => {
    expect(unifiedLineDiff("a\n", "")).toBe("-a\n");
  });

  it("returns an empty string for two empty documents", () => {
    expect(unifiedLineDiff("", "")).toBe("");
  });
});
