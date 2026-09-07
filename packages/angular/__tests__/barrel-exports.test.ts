// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import * as barrel from "../src/index.js";

describe("@narrativetrace/angular barrel exports", () => {
  test("re-exports NARRATIVE_CONTEXT token", () => {
    expect(barrel.NARRATIVE_CONTEXT).toBeDefined();
  });

  test("re-exports traceInterceptor", () => {
    expect(barrel.traceInterceptor).toBeDefined();
    expect(typeof barrel.traceInterceptor).toBe("function");
  });
});
