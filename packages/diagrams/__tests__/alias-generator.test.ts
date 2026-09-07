// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { generateAlias } from "../src/alias-generator.js";

describe("generateAlias", () => {
  test("generates non-empty alias for empty className", () => {
    const alias = generateAlias("", new Map());
    expect(alias.length).toBeGreaterThan(0);
    expect(alias.trim()).toBe(alias);
  });
});
