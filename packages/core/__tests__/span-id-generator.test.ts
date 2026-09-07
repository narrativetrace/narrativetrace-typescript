// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  generateSpanId,
  generateTraceId,
  isValidSpanId,
  isValidTraceId,
} from "../src/span-id-generator.js";

describe("generateTraceId", () => {
  test("produces 32 lowercase hex characters", () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("produces unique values", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateTraceId()));
    expect(ids.size).toBe(1000);
  });
});

describe("generateSpanId", () => {
  test("produces 16 lowercase hex characters", () => {
    const id = generateSpanId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  test("produces unique values", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateSpanId()));
    expect(ids.size).toBe(1000);
  });
});

describe("isValidTraceId", () => {
  test("accepts valid 32-hex traceId", () => {
    expect(isValidTraceId("4bf92f3577b34da6a3ce929d0e0e4736")).toBe(true);
  });

  test("rejects uppercase hex", () => {
    expect(isValidTraceId("4BF92F3577B34DA6A3CE929D0E0E4736")).toBe(false);
  });

  test("rejects wrong length", () => {
    expect(isValidTraceId("4bf92f3577b34da6")).toBe(false);
  });

  test("rejects non-hex characters", () => {
    expect(isValidTraceId("4bf92f3577b34da6a3ce929d0e0e473g")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidTraceId("")).toBe(false);
  });

  test("rejects all-zero traceId", () => {
    expect(isValidTraceId("00000000000000000000000000000000")).toBe(false);
  });
});

describe("isValidSpanId", () => {
  test("accepts valid 16-hex spanId", () => {
    expect(isValidSpanId("00f067aa0ba902b7")).toBe(true);
  });

  test("rejects uppercase hex", () => {
    expect(isValidSpanId("00F067AA0BA902B7")).toBe(false);
  });

  test("rejects wrong length", () => {
    expect(isValidSpanId("00f067aa")).toBe(false);
  });

  test("rejects non-hex characters", () => {
    expect(isValidSpanId("00f067aa0ba902bz")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidSpanId("")).toBe(false);
  });

  test("rejects all-zero spanId", () => {
    expect(isValidSpanId("0000000000000000")).toBe(false);
  });
});
