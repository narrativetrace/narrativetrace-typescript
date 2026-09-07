// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { synonymAlias } from "../src/synonym-alias.js";

describe("SynonymAlias", () => {
  test("carries the deprecated phrasing it records", () => {
    expect(synonymAlias("account with overdraft").alias).toBe("account with overdraft");
  });

  test("rejects an alias that is empty or only whitespace", () => {
    expect(() => synonymAlias("")).toThrow(TypeError);
    expect(() => synonymAlias("   ")).toThrow(TypeError);
    expect(() => synonymAlias("\t\n")).toThrow(TypeError);
  });
});
