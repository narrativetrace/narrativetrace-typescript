// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { isEnabled, parseTracingLevel } from "../src/tracing-level.js";

describe("parseTracingLevel", () => {
  test("parses each level case-insensitively with trimming", () => {
    expect(parseTracingLevel("OFF", "detail")).toBe("off");
    expect(parseTracingLevel("  Summary ", "detail")).toBe("summary");
    expect(parseTracingLevel("detail", "off")).toBe("detail");
  });

  test("blank, garbage or nullish falls back without throwing", () => {
    expect(parseTracingLevel("", "detail")).toBe("detail");
    expect(parseTracingLevel("   ", "detail")).toBe("detail");
    expect(parseTracingLevel("verbose", "detail")).toBe("detail");
    expect(parseTracingLevel(undefined, "narrative")).toBe("narrative");
    expect(parseTracingLevel(null, "errors")).toBe("errors");
  });
});

describe("isEnabled", () => {
  test("current == required → true", () => {
    expect(isEnabled("narrative", "narrative")).toBe(true);
  });

  test("current > required → true", () => {
    expect(isEnabled("detail", "narrative")).toBe(true);
  });

  test("current < required → false", () => {
    expect(isEnabled("errors", "narrative")).toBe(false);
  });

  test("off disables everything except itself", () => {
    expect(isEnabled("off", "off")).toBe(true);
    expect(isEnabled("off", "errors")).toBe(false);
    expect(isEnabled("off", "summary")).toBe(false);
    expect(isEnabled("off", "narrative")).toBe(false);
    expect(isEnabled("off", "detail")).toBe(false);
  });

  test("detail enables everything", () => {
    expect(isEnabled("detail", "off")).toBe(true);
    expect(isEnabled("detail", "errors")).toBe(true);
    expect(isEnabled("detail", "summary")).toBe(true);
    expect(isEnabled("detail", "narrative")).toBe(true);
    expect(isEnabled("detail", "detail")).toBe(true);
  });

  test("strict ordering: off < errors < summary < narrative < detail", () => {
    expect(isEnabled("errors", "off")).toBe(true);
    expect(isEnabled("summary", "errors")).toBe(true);
    expect(isEnabled("narrative", "summary")).toBe(true);
    expect(isEnabled("detail", "narrative")).toBe(true);
    // reverse
    expect(isEnabled("off", "errors")).toBe(false);
    expect(isEnabled("errors", "summary")).toBe(false);
    expect(isEnabled("summary", "narrative")).toBe(false);
    expect(isEnabled("narrative", "detail")).toBe(false);
  });
});
