// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { headingCount } from "../src/oracle/formats.js";

describe("headingCount", () => {
  test.each([
    ["an ATX heading", "# h", 1],
    ["a setext equals heading", "x\n===", 1],
    ["a setext dash heading", "x\n--", 1],
    ["a setext heading with an indented underline", "x\n   ===  ", 1],
    ["an underline with no text above it", "\n===", 0],
    ["an underline indented four spaces", "x\n    ===", 0],
    ["a table separator row", "| a |\n|---|", 0],
    ["plain text", "a - b\nx == y", 0],
  ])("counts %s", (_name, markdown, expected) => {
    expect(headingCount(markdown)).toBe(expected);
  });
});
