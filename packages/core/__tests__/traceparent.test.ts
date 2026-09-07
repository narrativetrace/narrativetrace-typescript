// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import { formatTraceparent, parseTraceparent } from "../src/traceparent.js";

describe("parseTraceparent", () => {
  test("extracts traceId from valid traceparent header", () => {
    const result = parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    expect(result).toBe("4bf92f3577b34da6a3ce929d0e0e4736" as TraceId);
  });

  test("returns undefined for invalid format", () => {
    expect(parseTraceparent("not-a-traceparent")).toBeUndefined();
  });

  test("returns undefined for all-zero traceId", () => {
    expect(
      parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01"),
    ).toBeUndefined();
  });

  test("returns undefined for undefined input", () => {
    expect(parseTraceparent(undefined)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(parseTraceparent("")).toBeUndefined();
  });

  // Security fuzz suite finding: the version and parent-span-id fields were captured by the
  // regex but never validated, so a version this port has no meaning for and an all-zero
  // (invalid, per W3C) parent span id both parsed successfully.
  test("returns undefined for the forbidden version ff", () => {
    expect(
      parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
    ).toBeUndefined();
  });

  test("returns undefined for an all-zero parent span id", () => {
    expect(
      parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01"),
    ).toBeUndefined();
  });
});

describe("formatTraceparent", () => {
  test("produces valid W3C traceparent header", () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736" as TraceId;
    const spanId = "00f067aa0ba902b7" as SpanId;
    expect(formatTraceparent(traceId, spanId)).toBe(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
  });

  test("round-trips with parseTraceparent", () => {
    const traceId = "aabbccdd11223344aabbccdd11223344" as TraceId;
    const spanId = "1122334455667788" as SpanId;
    const header = formatTraceparent(traceId, spanId);
    expect(parseTraceparent(header)).toBe(traceId);
  });
});
