// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { createOtelEventConsumer } from "../src/index.js";

describe("barrel exports", () => {
  it("re-exports createOtelEventConsumer", () => {
    expect(createOtelEventConsumer).toBeDefined();
    expect(typeof createOtelEventConsumer).toBe("function");
  });
});
