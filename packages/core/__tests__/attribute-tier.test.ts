// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  type AttributeTier,
  SPAN_CONTEXT_FIELDS,
  spanContextFieldTier,
} from "../src/attribute-tier.js";

describe("spanContextFieldTier", () => {
  test("classifies serviceName as resource tier", () => {
    expect(spanContextFieldTier("serviceName")).toBe<AttributeTier>("resource");
  });

  test("classifies all resource-tier fields", () => {
    for (const field of ["serviceName", "serviceVersion", "environment"]) {
      expect(spanContextFieldTier(field)).toBe<AttributeTier>("resource");
    }
  });

  test("classifies all trace-tier fields", () => {
    const traceFields = [
      "traceId",
      "httpMethod",
      "httpRoute",
      "clientIp",
      "enduserId",
      "sessionId",
      "tenantId",
    ];
    for (const field of traceFields) {
      expect(spanContextFieldTier(field)).toBe<AttributeTier>("trace");
    }
  });

  test("classifies all span-tier fields", () => {
    const spanFields = ["spanId", "parentSpanId", "traceFlags", "traceState", "spanName"];
    for (const field of spanFields) {
      expect(spanContextFieldTier(field)).toBe<AttributeTier>("span");
    }
  });

  test("throws for unknown field", () => {
    expect(() => spanContextFieldTier("bogus")).toThrow("Unknown SpanContext field: bogus");
  });

  test("covers all 15 SpanContext fields with correct tier counts", () => {
    expect(SPAN_CONTEXT_FIELDS.size).toBe(15);
    const counts = { resource: 0, trace: 0, span: 0 };
    for (const tier of SPAN_CONTEXT_FIELDS.values()) {
      counts[tier]++;
    }
    expect(counts).toEqual({ resource: 3, trace: 7, span: 5 });
  });
});
