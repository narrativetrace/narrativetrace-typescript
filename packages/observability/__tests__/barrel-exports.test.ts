// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

describe("barrel exports", () => {
  it("re-exports all public API", () => {
    expect(api.LogContext).toBeDefined();
    expect(api.createLogEnricher).toBeDefined();
    expect(api.createEnricherEventConsumer).toBeDefined();
  });
});
