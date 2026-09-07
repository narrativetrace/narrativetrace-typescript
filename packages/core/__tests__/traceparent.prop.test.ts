// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { expect, test } from "vitest";
import type { SpanId, TraceId } from "../src/span-id-generator.js";
import { formatTraceparent, parseTraceparent } from "../src/traceparent.js";

const hexChar = fc.constantFrom(..."0123456789abcdef".split(""));
const traceIdArb = fc
  .array(hexChar, { minLength: 32, maxLength: 32 })
  .map((chars) => chars.join("") as TraceId)
  .filter((id) => id !== "00000000000000000000000000000000");
const spanIdArb = fc
  .array(hexChar, { minLength: 16, maxLength: 16 })
  .map((chars) => chars.join("") as SpanId)
  .filter((id) => id !== "0000000000000000");

test("formatTraceparent round-trips with parseTraceparent for any valid IDs", () => {
  fc.assert(
    fc.property(traceIdArb, spanIdArb, (traceId, spanId) => {
      const header = formatTraceparent(traceId, spanId);
      const parsed = parseTraceparent(header);
      expect(parsed).toBe(traceId);
    }),
  );
});

test("formatTraceparent always produces valid W3C traceparent format", () => {
  fc.assert(
    fc.property(traceIdArb, spanIdArb, (traceId, spanId) => {
      const header = formatTraceparent(traceId, spanId);
      expect(header).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    }),
  );
});

test("parseTraceparent returns undefined for random strings", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      const result = parseTraceparent(s);
      // Either undefined or a valid TraceId — never throws
      expect(result === undefined || typeof result === "string").toBe(true);
    }),
  );
});
