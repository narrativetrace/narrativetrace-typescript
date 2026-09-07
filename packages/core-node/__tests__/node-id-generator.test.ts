// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { generateSpanId, generateTraceId, isValidSpanId, isValidTraceId } from "../src/index.js";

describe("core-node ID generation", () => {
  test("generateTraceId produces a valid 32-hex trace ID", () => {
    const id = generateTraceId();
    expect(isValidTraceId(id)).toBe(true);
  });

  test("generateSpanId produces a valid 16-hex span ID", () => {
    const id = generateSpanId();
    expect(isValidSpanId(id)).toBe(true);
  });
});
